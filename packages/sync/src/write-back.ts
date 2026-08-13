import {
  createCalDAVSourceWriter,
  createCoordinatedRefresher,
  createGoogleSourceWriter,
  createGoogleTokenRefresher,
  createMicrosoftTokenRefresher,
  createOutlookSourceWriter,
  TWO_WAY_EPOCH_WINDOW_MS,
  withSourceIngestLocks,
  WRITE_BACK_WITNESS_RESET,
} from "@keeper.sh/calendar";
import type {
  CalendarSourceWriter,
  InboundClassification,
  RefreshLockStore,
  RemoteEventPresence,
  RemoteEventReference,
  WriteBackUpdates,
} from "@keeper.sh/calendar";
import { createDigestAwareFetch, resolveAuthMethod } from "@keeper.sh/calendar/digest-fetch";
import { createSafeFetch } from "@keeper.sh/calendar/safe-fetch";
import {
  TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
  TWO_WAY_WRITE_BACK_DAILY_WINDOW_MS,
} from "@keeper.sh/constants";
import { decryptPassword } from "@keeper.sh/database";
import {
  caldavCredentialsTable,
  calendarAccountsTable,
  calendarsTable,
  eventMappingsTable,
  eventStatesTable,
  eventWriteBackTombstonesTable,
  oauthCredentialsTable,
  sourceDestinationMappingsTable,
} from "@keeper.sh/database/schema";
import { and, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { createDAVClient } from "tsdav";
import type { OAuthConfig } from "./resolve-provider";
import { MAX_WRITE_BACKS_PER_PASS, runWriteBackPass } from "./write-back-pass";
import type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackStore,
  WriteBackTarget,
} from "./write-back-pass";

const TOMBSTONE_RETENTION_MS = 30 * 86_400_000;
const DELETE_CONFIRMATION_STATE = "delete_confirmation_required";
const OAUTH_PROVIDERS = new Set(["google", "outlook"]);
const CALDAV_PROVIDERS = new Set(["caldav", "fastmail", "icloud"]);
const NO_OBSERVATIONS = 0;
const NO_EPOCHS = 0;
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const FIRST_EPOCH = 1;
const EPOCH_INCREMENT = 1;
const DELETE_BLOCKED_INCREMENT = 1;
const SIBLING_EXISTENCE_LIMIT = 1;

type LockedDatabase = Parameters<Parameters<typeof withSourceIngestLocks>[2]>[0];

interface WriteBackApplierConfig {
  abortSignal?: AbortSignal;
  database: BunSQLDatabase;
  encryptionKey?: string;
  oauthConfig: OAuthConfig;
  onError?: (error: unknown, context: { mappingId: string }) => void;
  probeDestinationEvent?: (
    reference: RemoteEventReference,
  ) => Promise<RemoteEventPresence>;
  /*
   * A write-back changes the source, so every other destination mirroring it now holds a
   * stale copy. This wakes them to re-read; it must never be a suppression signal, or a
   * completed provider write goes unflushed and its events are re-added next pass.
   */
  notifySourceChanged?: (userId: string) => Promise<void>;
  refreshLockStore?: RefreshLockStore | null;
  userId: string;
}

/*
 * A blank client credential reaches the provider as a rejected token refresh rather than
 * as the deployment misconfiguration it is, and the pair it belongs to spends its failure
 * budget on a request that could never have succeeded.
 */
const requireOAuthClient = (
  value: string | undefined,
  field: string,
  sourceCalendarId: string,
): string => {
  if (!value) {
    throw new Error(
      `Source calendar ${sourceCalendarId} needs ${field} configured to write back`,
    );
  }
  return value;
};

const createRawRefresher = (
  config: WriteBackApplierConfig,
  provider: string,
  sourceCalendarId: string,
): ((refreshToken: string) => Promise<{ access_token: string; expires_in: number }>) => {
  const { oauthConfig } = config;
  if (provider === "google") {
    const refresh = createGoogleTokenRefresher({
      clientId: requireOAuthClient(
        oauthConfig.googleClientId,
        "googleClientId",
        sourceCalendarId,
      ),
      clientSecret: requireOAuthClient(
        oauthConfig.googleClientSecret,
        "googleClientSecret",
        sourceCalendarId,
      ),
    });
    return (refreshToken) => refresh(refreshToken);
  }
  const refresh = createMicrosoftTokenRefresher({
    clientId: requireOAuthClient(
      oauthConfig.microsoftClientId,
      "microsoftClientId",
      sourceCalendarId,
    ),
    clientSecret: requireOAuthClient(
      oauthConfig.microsoftClientSecret,
      "microsoftClientSecret",
      sourceCalendarId,
    ),
  });
  return (refreshToken) => refresh(refreshToken);
};

const createOAuthAccessTokenReader = (
  config: WriteBackApplierConfig,
  provider: string,
  sourceCalendarId: string,
  credentials: {
    accessToken: string;
    accountId: string;
    credentialId: string;
    expiresAt: Date;
    refreshToken: string;
  },
): () => Promise<string> => {
  const refresh = createCoordinatedRefresher({
    calendarAccountId: credentials.accountId,
    database: config.database,
    oauthCredentialId: credentials.credentialId,
    rawRefresh: createRawRefresher(config, provider, sourceCalendarId),
    refreshLockStore: config.refreshLockStore ?? null,
  });

  return async () => {
    if (credentials.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return credentials.accessToken;
    }
    const refreshed = await refresh(credentials.refreshToken);
    return refreshed.access_token;
  };
};

const resolveOAuthSourceWriter = async (
  config: WriteBackApplierConfig,
  provider: string,
  sourceCalendarId: string,
): Promise<CalendarSourceWriter | null> => {
  const [credentials] = await config.database
    .select({
      accessToken: oauthCredentialsTable.accessToken,
      accountId: calendarAccountsTable.id,
      credentialId: oauthCredentialsTable.id,
      expiresAt: oauthCredentialsTable.expiresAt,
      externalCalendarId: calendarsTable.externalCalendarId,
      refreshToken: oauthCredentialsTable.refreshToken,
    })
    .from(oauthCredentialsTable)
    .innerJoin(
      calendarAccountsTable,
      eq(calendarAccountsTable.oauthCredentialId, oauthCredentialsTable.id),
    )
    .innerJoin(calendarsTable, eq(calendarsTable.accountId, calendarAccountsTable.id))
    .where(eq(calendarsTable.id, sourceCalendarId))
    .limit(1);

  if (!credentials) {
    return null;
  }

  const accessToken = createOAuthAccessTokenReader(
    config,
    provider,
    sourceCalendarId,
    credentials,
  );
  if (provider === "google") {
    return createGoogleSourceWriter({
      accessToken,
      externalCalendarId: credentials.externalCalendarId,
    });
  }
  return createOutlookSourceWriter({ accessToken });
};

/*
 * A blank key decrypts a stored password into garbage, which reaches the server as a
 * failed login rather than as the configuration error it is.
 */
const requireEncryptionKey = (
  encryptionKey: string | undefined,
  sourceCalendarId: string,
): string => {
  if (!encryptionKey) {
    throw new Error(
      `Source calendar ${sourceCalendarId} needs an encryption key to write back`,
    );
  }
  return encryptionKey;
};

const resolveCalDAVSourceWriter = async (
  config: WriteBackApplierConfig,
  sourceCalendarId: string,
): Promise<CalendarSourceWriter | null> => {
  const [credentials] = await config.database
    .select({
      authMethod: caldavCredentialsTable.authMethod,
      calendarUrl: calendarsTable.calendarUrl,
      encryptedPassword: caldavCredentialsTable.encryptedPassword,
      serverUrl: caldavCredentialsTable.serverUrl,
      username: caldavCredentialsTable.username,
    })
    .from(caldavCredentialsTable)
    .innerJoin(
      calendarAccountsTable,
      eq(calendarAccountsTable.caldavCredentialId, caldavCredentialsTable.id),
    )
    .innerJoin(calendarsTable, eq(calendarsTable.accountId, calendarAccountsTable.id))
    .where(eq(calendarsTable.id, sourceCalendarId))
    .limit(1);

  if (!credentials?.calendarUrl) {
    return null;
  }

  const password = decryptPassword(
    credentials.encryptedPassword,
    requireEncryptionKey(config.encryptionKey, sourceCalendarId),
  );
  const { calendarUrl } = credentials;
  return createCalDAVSourceWriter({
    calendarUrl,
    client: () => {
      /*
       * Tsdav takes no per-request signal, so the only bound on a CalDAV write held
       * under the source ingest lock is the one baked into its fetch.
       */
      const { fetch: digestAwareFetch } = createDigestAwareFetch({
        baseFetch: createSafeFetch({
          ...(config.abortSignal && { signal: config.abortSignal }),
          timeoutMs: TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
        }),
        credentials: { password, username: credentials.username },
        knownAuthMethod: resolveAuthMethod(credentials.authMethod),
      });
      return createDAVClient({
        authFunction: () => Promise.resolve({}),
        authMethod: "Custom",
        credentials: { password, username: credentials.username },
        defaultAccountType: "caldav",
        fetch: digestAwareFetch,
        serverUrl: credentials.serverUrl,
      });
    },
  });
};

const resolveSourceWriter = async (
  config: WriteBackApplierConfig,
  sourceCalendarId: string,
): Promise<CalendarSourceWriter | null> => {
  const [source] = await config.database
    .select({ provider: calendarAccountsTable.provider })
    .from(calendarsTable)
    .innerJoin(calendarAccountsTable, eq(calendarsTable.accountId, calendarAccountsTable.id))
    .where(eq(calendarsTable.id, sourceCalendarId))
    .limit(1);

  if (!source) {
    return null;
  }
  if (OAUTH_PROVIDERS.has(source.provider)) {
    return resolveOAuthSourceWriter(config, source.provider, sourceCalendarId);
  }
  if (CALDAV_PROVIDERS.has(source.provider)) {
    return resolveCalDAVSourceWriter(config, sourceCalendarId);
  }
  return null;
};

const toEventStateAssignment = (updates: WriteBackUpdates): Record<string, unknown> => ({
  ...("summary" in updates && { title: updates.summary }),
  ...("description" in updates && { description: updates.description }),
  ...("location" in updates && { location: updates.location }),
  ...(updates.startTime && { startTime: updates.startTime }),
  ...(updates.endTime && { endTime: updates.endTime }),
  ...("isAllDay" in updates && { isAllDay: updates.isAllDay }),
  ...(updates.startTimeZone && { startTimeZone: updates.startTimeZone }),
});

const readSourceEventFrom = async (
  database: BunSQLDatabase | LockedDatabase,
  eventStateId: string,
): Promise<SourceEventSnapshot | null> => {
  const [row] = await database
    .select({
      description: eventStatesTable.description,
      endTime: eventStatesTable.endTime,
      isAllDay: eventStatesTable.isAllDay,
      location: eventStatesTable.location,
      startTime: eventStatesTable.startTime,
      startTimeZone: eventStatesTable.startTimeZone,
      title: eventStatesTable.title,
    })
    .from(eventStatesTable)
    .where(eq(eventStatesTable.id, eventStateId))
    .limit(1);

  return row ?? null;
};

/*
 * The epoch window rolls: a mapping whose window opened over an hour ago starts a fresh
 * budget rather than carrying an ancient count. Postgres evaluates every assignment
 * against the pre-update row, so both branches read the same window start.
 */
const buildEpochAssignment = (): Record<string, unknown> => {
  const staleWindow = sql`(
    ${eventMappingsTable.writeBackEpochWindowStart} is null
    or ${eventMappingsTable.writeBackEpochWindowStart}
      < now() - (interval '1 millisecond' * ${TWO_WAY_EPOCH_WINDOW_MS})
  )`;

  return {
    writeBackEpoch: sql`case when ${staleWindow} then ${FIRST_EPOCH}
      else ${eventMappingsTable.writeBackEpoch} + ${EPOCH_INCREMENT} end`,
    writeBackEpochWindowStart: sql`case when ${staleWindow} then now()
      else ${eventMappingsTable.writeBackEpochWindowStart} end`,
  };
};

const buildDailyAssignment = (): Record<string, unknown> => {
  const staleWindow = sql`(
    ${eventMappingsTable.writeBackDailyWindowStart} is null
    or ${eventMappingsTable.writeBackDailyWindowStart}
      < now() - (interval '1 millisecond' * ${TWO_WAY_WRITE_BACK_DAILY_WINDOW_MS})
  )`;

  return {
    writeBackDailyCount: sql`case when ${staleWindow} then ${FIRST_EPOCH}
      else ${eventMappingsTable.writeBackDailyCount} + ${EPOCH_INCREMENT} end`,
    writeBackDailyWindowStart: sql`case when ${staleWindow} then now()
      else ${eventMappingsTable.writeBackDailyWindowStart} end`,
  };
};

const createLockedStore = (locked: LockedDatabase): LockedWriteBackStore => ({
  commitDelete: async ({ eventStateId, mappingId, tombstoneId }) => {
    await locked.delete(eventMappingsTable).where(eq(eventMappingsTable.id, mappingId));
    await locked.delete(eventStatesTable).where(eq(eventStatesTable.id, eventStateId));
    await locked
      .update(eventWriteBackTombstonesTable)
      .set({ appliedAt: new Date(), state: "applied" })
      .where(eq(eventWriteBackTombstonesTable.id, tombstoneId));
  },
  commitUpdate: async ({
    eventStateId,
    mappingId,
    observed,
    projectedSyncEventHash,
    updates,
  }) => {
    await locked
      .update(eventStatesTable)
      .set(toEventStateAssignment(updates))
      .where(eq(eventStatesTable.id, eventStateId));
    const [row] = await locked
      .update(eventMappingsTable)
      .set({
        destinationAvailability: observed.availability,
        destinationContentHash: observed.contentHash,
        destinationDescription: observed.description,
        destinationEndTime: observed.endTime,
        destinationIsAllDay: observed.isAllDay,
        destinationLocation: observed.location,
        destinationStartTime: observed.startTime,
        destinationSummary: observed.summary,
        missingFirstObservedAt: null,
        missingObservationCount: NO_OBSERVATIONS,
        syncEventHash: projectedSyncEventHash,
        ...buildEpochAssignment(),
        ...buildDailyAssignment(),
        ...(updates.startTime && { startTime: updates.startTime }),
        ...(updates.endTime && { endTime: updates.endTime }),
      })
      .where(eq(eventMappingsTable.id, mappingId))
      .returning({
        writeBackDailyCount: eventMappingsTable.writeBackDailyCount,
        writeBackEpoch: eventMappingsTable.writeBackEpoch,
      });

    return {
      writeBackDailyCount: row?.writeBackDailyCount ?? NO_EPOCHS,
      writeBackEpoch: row?.writeBackEpoch ?? NO_EPOCHS,
    };
  },
  readMappingSyncEventHash: async (mappingId) => {
    const [row] = await locked
      .select({ syncEventHash: eventMappingsTable.syncEventHash })
      .from(eventMappingsTable)
      .where(eq(eventMappingsTable.id, mappingId))
      .limit(1);
    return row ?? null;
  },
  readSourceEvent: (eventStateId) => readSourceEventFrom(locked, eventStateId),
});

/*
 * A recorded observation belongs to the policy it was taken under, so every write-back
 * state transition drops it and the next pass adopts what the destination reports. The
 * budgets spent under that policy go back with it, or a cleared quarantine would stay
 * refused for having once run away.
 */
const clearDestinationWitnesses = async (
  database: BunSQLDatabase,
  destinationCalendarId: string,
  sourceCalendarIds: string[],
): Promise<void> => {
  if (sourceCalendarIds.length === 0) {
    return;
  }
  await database
    .update(eventMappingsTable)
    .set({ ...WRITE_BACK_WITNESS_RESET })
    .where(and(
      eq(eventMappingsTable.calendarId, destinationCalendarId),
      inArray(eventMappingsTable.sourceCalendarId, sourceCalendarIds),
    ));
};

const requireProbe = (
  config: WriteBackApplierConfig,
): (reference: RemoteEventReference) => Promise<RemoteEventPresence> => {
  const { probeDestinationEvent } = config;
  if (!probeDestinationEvent) {
    throw new Error("The destination provider cannot confirm a copy is gone");
  }
  return probeDestinationEvent;
};

interface SiblingNotifierDependencies {
  hasSibling: (sourceCalendarId: string, destinationCalendarId: string) => Promise<boolean>;
  notifySourceChanged?: (userId: string) => Promise<void>;
  userId: string;
}

/*
 * Reached only once a write-back has actually changed the source, so this is a wake-up
 * and never a suppression signal. The enqueue is user-scoped and so wakes every push
 * destination rather than only the siblings; that is idempotent on a stable job id, and
 * skipping it when no other destination mirrors the source is what keeps a mirror that
 * rewrites content on read-back from sustaining a wake-up loop.
 */
const createSiblingNotifier = (
  dependencies: SiblingNotifierDependencies,
) => async (sourceCalendarId: string, destinationCalendarId: string): Promise<void> => {
  if (!dependencies.notifySourceChanged) {
    return;
  }
  if (!await dependencies.hasSibling(sourceCalendarId, destinationCalendarId)) {
    return;
  }
  await dependencies.notifySourceChanged(dependencies.userId);
};

const createDatabaseWriteBackStore = (
  config: WriteBackApplierConfig,
): WriteBackStore => ({
  abandonTombstone: async (tombstoneId) => {
    await config.database
      .update(eventWriteBackTombstonesTable)
      .set({ state: "abandoned" })
      .where(eq(eventWriteBackTombstonesTable.id, tombstoneId));
  },
  countRecentDeletes: async (sourceCalendarId, since) => {
    const [row] = await config.database
      .select({ total: count() })
      .from(eventWriteBackTombstonesTable)
      .where(and(
        eq(eventWriteBackTombstonesTable.sourceCalendarId, sourceCalendarId),
        eq(eventWriteBackTombstonesTable.state, "applied"),
        gte(eventWriteBackTombstonesTable.appliedAt, since),
      ));
    return row?.total ?? NO_OBSERVATIONS;
  },
  loadTarget: async (mappingId) => {
    const [row] = await config.database
      .select({
        deleteIdentifier: eventMappingsTable.deleteIdentifier,
        destinationCalendarId: eventMappingsTable.calendarId,
        destinationEventUid: eventMappingsTable.destinationEventUid,
        eventStateId: eventMappingsTable.eventStateId,
        sourceCalendarId: eventMappingsTable.sourceCalendarId,
        sourceEventId: eventStatesTable.sourceEventId,
        sourceEventUid: eventStatesTable.sourceEventUid,
      })
      .from(eventMappingsTable)
      .innerJoin(eventStatesTable, eq(eventMappingsTable.eventStateId, eventStatesTable.id))
      .where(eq(eventMappingsTable.id, mappingId))
      .limit(1);

    if (!row?.eventStateId || !row.sourceCalendarId || !row.sourceEventUid) {
      return null;
    }

    return {
      deleteIdentifier: row.deleteIdentifier ?? row.destinationEventUid,
      destinationCalendarId: row.destinationCalendarId,
      destinationEventUid: row.destinationEventUid,
      eventStateId: row.eventStateId,
      mappingId,
      sourceCalendarId: row.sourceCalendarId,
      sourceEventId: row.sourceEventId,
      sourceEventUid: row.sourceEventUid,
    };
  },
  /*
   * Absent from the destination's own answer, not merely absent from a list. A
   * destination provider that cannot answer this question can never delete anything on
   * a source, because the applier refuses without a confirmed not-found.
   */
  ...(config.probeDestinationEvent && {
    probeDestinationEvent: (target: WriteBackTarget) => {
      const { deleteIdentifier, destinationEventUid } = target;
      if (!destinationEventUid || !deleteIdentifier) {
        throw new Error(
          `Event mapping ${target.mappingId} has no destination identity to probe`,
        );
      }
      return requireProbe(config)({
        deleteId: deleteIdentifier,
        uid: destinationEventUid,
      });
    },
  }),
  notifySiblings: createSiblingNotifier({
    hasSibling: async (sourceCalendarId, destinationCalendarId) => {
      const [sibling] = await config.database
        .select({ destinationCalendarId: sourceDestinationMappingsTable.destinationCalendarId })
        .from(sourceDestinationMappingsTable)
        .where(and(
          eq(sourceDestinationMappingsTable.sourceCalendarId, sourceCalendarId),
          ne(sourceDestinationMappingsTable.destinationCalendarId, destinationCalendarId),
        ))
        .limit(SIBLING_EXISTENCE_LIMIT);
      return Boolean(sibling);
    },
    ...(config.notifySourceChanged && { notifySourceChanged: config.notifySourceChanged }),
    userId: config.userId,
  }),
  quarantineMapping: async (sourceCalendarId, destinationCalendarId, reason) => {
    await config.database
      .update(sourceDestinationMappingsTable)
      .set({ writeBackState: "quarantined", writeBackStateReason: reason })
      .where(and(
        eq(sourceDestinationMappingsTable.sourceCalendarId, sourceCalendarId),
        eq(sourceDestinationMappingsTable.destinationCalendarId, destinationCalendarId),
      ));
    await clearDestinationWitnesses(
      config.database,
      destinationCalendarId,
      [sourceCalendarId],
    );
  },
  readSourceEvent: (eventStateId) => readSourceEventFrom(config.database, eventStateId),
  recordFailure: async (mappingId) => {
    const [row] = await config.database
      .update(eventMappingsTable)
      .set(buildEpochAssignment())
      .where(eq(eventMappingsTable.id, mappingId))
      .returning({ writeBackEpoch: eventMappingsTable.writeBackEpoch });
    return row?.writeBackEpoch ?? NO_EPOCHS;
  },
  /*
   * One live record per mapping, refreshed rather than duplicated. An attempt the lock
   * check abandoned or a crash interrupted leaves a record behind, and a plain insert
   * would collide with it on every retry: the deletion could never complete and the pair
   * would quarantine on a constraint rather than on anything the user did.
   */
  recordTombstone: async ({ snapshot, target }) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOMBSTONE_RETENTION_MS);
    const [row] = await config.database
      .insert(eventWriteBackTombstonesTable)
      .values({
        destinationCalendarId: target.destinationCalendarId,
        eventMappingId: target.mappingId,
        eventStateId: target.eventStateId,
        expiresAt,
        observedAt: now,
        snapshot,
        sourceCalendarId: target.sourceCalendarId,
        sourceEventUid: target.sourceEventUid,
        state: "pending",
      })
      .onConflictDoUpdate({
        set: { appliedAt: now, expiresAt, observedAt: now, snapshot, state: "pending" },
        target: eventWriteBackTombstonesTable.eventMappingId,
      })
      .returning({ id: eventWriteBackTombstonesTable.id });

    if (!row) {
      throw new Error(
        `Refusing to delete ${target.sourceEventUid} without a committed tombstone`,
      );
    }
    return row.id;
  },
  /*
   * The pending state is left exactly where it is. The pair is waiting on an answer about
   * copies it can still see, and clearing the counters would destroy the very state the
   * answer applies to.
   */
  requestDeleteConfirmation: async (sourceCalendarId, destinationCalendarId, reason) => {
    await config.database
      .update(sourceDestinationMappingsTable)
      .set({
        writeBackState: DELETE_CONFIRMATION_STATE,
        writeBackStateReason: reason,
      })
      .where(and(
        eq(sourceDestinationMappingsTable.sourceCalendarId, sourceCalendarId),
        eq(sourceDestinationMappingsTable.destinationCalendarId, destinationCalendarId),
      ));
  },
  resolveWriter: (sourceCalendarId) => resolveSourceWriter(config, sourceCalendarId),
  withSourceLock: (sourceCalendarId, run) =>
    withSourceIngestLocks(
      config.database,
      [sourceCalendarId],
      (locked) => run(createLockedStore(locked)),
    ),
});

const createInboundWriteBackApplier = (config: WriteBackApplierConfig) => {
  const store = createDatabaseWriteBackStore(config);

  return async (input: {
    calendarId: string;
    classifications: InboundClassification[];
  }): Promise<{
    abandoned: number;
    applied: number;
    deleteBlocked: number;
    failed: number;
  }> => {
    let deleteBlocked = NO_OBSERVATIONS;
    const result = await runWriteBackPass({
      calendarId: input.calendarId,
      classifications: input.classifications,
      onDeleteBlocked: () => {
        deleteBlocked += DELETE_BLOCKED_INCREMENT;
      },
      ...(config.onError && { onError: config.onError }),
      ...(config.abortSignal && { signal: config.abortSignal }),
      store,
    });

    return {
      abandoned: result.abandoned,
      applied: result.applied,
      deleteBlocked,
      failed: result.failed,
    };
  };
};

export {
  clearDestinationWitnesses,
  createDatabaseWriteBackStore,
  createInboundWriteBackApplier,
  createSiblingNotifier,
  MAX_WRITE_BACKS_PER_PASS,
  requireEncryptionKey,
  resolveSourceWriter,
};
export type { SiblingNotifierDependencies, WriteBackApplierConfig };
