import {
  DEFAULT_EVENT_NAME,
  normalizeText,
  resolveIsAllDayEvent,
  TWO_WAY_EPOCH_QUARANTINE_LIMIT,
} from "@keeper.sh/calendar";
import type {
  CalendarSourceWriter,
  ExpectedSourceFields,
  InboundClassification,
  RemoteEventPresence,
  WriteBackUpdates,
} from "@keeper.sh/calendar";
import {
  TWO_WAY_DELETE_DAILY_CAP,
  TWO_WAY_DELETE_DAILY_WINDOW_MS,
  TWO_WAY_WRITE_BACK_DAILY_CAP,
  TWO_WAY_WRITE_BACK_PASS_BUDGET_MS,
} from "@keeper.sh/constants";

const MAX_WRITE_BACKS_PER_PASS = 25;
const NO_WORK = 0;

/*
 * The hourly epoch is renewed by any oscillation slower than its threshold, so the
 * rolling day is what stops a destination that varies a few times an hour from writing
 * to a real calendar forever.
 */
class WriteBackDailyCapError extends Error {
  constructor(mappingId: string) {
    super(`Write-back daily cap spent for mapping ${mappingId}`);
    this.name = "WriteBackDailyCapError";
  }
}

class UnusableSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnusableSourceError";
  }
}

interface WriteBackTarget {
  deleteIdentifier?: string;
  destinationCalendarId: string;
  destinationEventUid?: string;
  eventStateId: string;
  mappingId: string;
  sourceCalendarId: string;
  sourceEventId: string | null;
  sourceEventUid: string;
}

interface SourceEventSnapshot {
  description: string | null;
  endTime: Date;
  isAllDay: boolean | null;
  location: string | null;
  startTime: Date;
  startTimeZone: string | null;
  title: string | null;
}

interface CommitUpdateInput {
  eventStateId: string;
  mappingId: string;
  observed: Extract<InboundClassification, { type: "write-back" }>["observed"];
  projectedSyncEventHash: string | null;
  updates: WriteBackUpdates;
}

interface LockedWriteBackStore {
  commitDelete: (input: {
    eventStateId: string;
    mappingId: string;
    tombstoneId: string;
  }) => Promise<void>;
  commitUpdate: (
    input: CommitUpdateInput,
  ) => Promise<{ writeBackDailyCount?: number; writeBackEpoch: number }>;
  readMappingSyncEventHash: (mappingId: string) => Promise<
    { syncEventHash: string | null } | null
  >;
  readSourceEvent: (eventStateId: string) => Promise<SourceEventSnapshot | null>;
}

interface WriteBackStore {
  abandonTombstone: (tombstoneId: string) => Promise<void>;
  countRecentDeletes: (sourceCalendarId: string, since: Date) => Promise<number>;
  loadTarget: (mappingId: string) => Promise<WriteBackTarget | null>;
  /*
   * A list read has no completeness guarantee, so absence from one is a candidate signal
   * and never evidence. The original on the source is destroyed only after a targeted
   * read of the copy answers with a definitive not-found.
   */
  probeDestinationEvent?: (target: WriteBackTarget) => Promise<RemoteEventPresence>;
  notifySiblings: (
    sourceCalendarId: string,
    destinationCalendarId: string,
  ) => Promise<void>;
  quarantineMapping: (
    sourceCalendarId: string,
    destinationCalendarId: string,
    reason: string,
  ) => Promise<void>;
  readSourceEvent: (eventStateId: string) => Promise<SourceEventSnapshot | null>;
  /*
   * A write-back the provider keeps rejecting would otherwise be retried under the source
   * ingest lock once a minute forever, so a failure spends the same budget a success does.
   */
  recordFailure: (mappingId: string) => Promise<number>;
  /*
   * A deletion the copy keeps refusing to confirm is a question, not a failure. Asking it
   * pauses the pair with its pending state intact, which is the only outcome that both
   * ends the retry and tells the user why nothing was deleted.
   */
  requestDeleteConfirmation?: (
    sourceCalendarId: string,
    destinationCalendarId: string,
    reason: string,
  ) => Promise<void>;
  recordTombstone: (input: {
    snapshot: SourceEventSnapshot;
    target: WriteBackTarget;
  }) => Promise<string>;
  resolveWriter: (sourceCalendarId: string) => Promise<CalendarSourceWriter | null>;
  withSourceLock: <TResult>(
    sourceCalendarId: string,
    run: (locked: LockedWriteBackStore) => Promise<TResult>,
  ) => Promise<TResult>;
}

type DeleteBlockedReason = "probe_unavailable" | "still_present";

interface WriteBackPassInput {
  calendarId: string;
  classifications: InboundClassification[];
  now?: () => Date;
  onDeleteBlocked?: (context: {
    mappingId: string;
    reason: DeleteBlockedReason;
  }) => void;
  onError?: (error: unknown, context: { mappingId: string }) => void;
  signal?: AbortSignal;
  store: WriteBackStore;
}

interface WriteBackPassResult {
  abandoned: number;
  applied: number;
  failed: number;
  quarantined: number;
  withheld: number;
}

/*
 * A quarantine is the decision that this pair can no longer be trusted to write to a real
 * calendar. Reverting it to one-way while the rest of the pass keeps applying the
 * classifications that pair produced would destroy source events Keeper has already told
 * the user it stopped touching, so the pair is fenced off for the remainder of the pass.
 */
const createPairKey = (target: WriteBackTarget): string =>
  `${target.sourceCalendarId}|${target.destinationCalendarId}`;

type ActionableClassification = Extract<
  InboundClassification,
  { type: "delete" } | { type: "write-back" }
>;

const isActionable = (
  classification: InboundClassification,
): classification is ActionableClassification =>
  classification.type === "delete" || classification.type === "write-back";

const matchesExpectedText = (expected: string | undefined, actual: string | null): boolean =>
  typeof expected !== "string" || normalizeText(expected) === normalizeText(actual ?? "");

const matchesExpectedDate = (expected: Date | undefined, actual: Date): boolean =>
  !(expected instanceof Date) || expected.getTime() === actual.getTime();

/*
 * Every field a write-back touches is one whose projection to the destination is the
 * identity, so the value the classifier saw is byte-for-byte the value stored on the
 * source. Comparing them under the lock is what turns a fan-in race into the ordinary
 * both-sides-changed case, which the next pass resolves in favour of the source. A source
 * event carrying no title of its own is the exception: the reconcile path substitutes a
 * placeholder for it, so that placeholder is what the classifier compared against.
 */
const matchesExpectedSource = (
  expected: ExpectedSourceFields,
  snapshot: SourceEventSnapshot,
): boolean => {
  const expectedAllDay = expected.isAllDay;
  const actualAllDay = resolveIsAllDayEvent({
    endTime: snapshot.endTime,
    ...(typeof snapshot.isAllDay === "boolean" && { isAllDay: snapshot.isAllDay }),
    startTime: snapshot.startTime,
  });

  return matchesExpectedText(expected.summary, snapshot.title ?? DEFAULT_EVENT_NAME)
    && matchesExpectedText(expected.description, snapshot.description)
    && matchesExpectedText(expected.location, snapshot.location)
    && matchesExpectedDate(expected.startTime, snapshot.startTime)
    && matchesExpectedDate(expected.endTime, snapshot.endTime)
    && (typeof expectedAllDay !== "boolean" || expectedAllDay === actualAllDay);
};

const isStillTheStateWeClassified = async (
  locked: LockedWriteBackStore,
  classification: ActionableClassification,
  target: WriteBackTarget,
): Promise<boolean> => {
  const mapping = await locked.readMappingSyncEventHash(target.mappingId);
  if (!mapping || mapping.syncEventHash !== classification.expectedSyncEventHash) {
    return false;
  }
  const snapshot = await locked.readSourceEvent(target.eventStateId);
  if (!snapshot) {
    return false;
  }
  return matchesExpectedSource(classification.expectedSource, snapshot);
};

type Outcome = "abandoned" | "applied" | "quarantined";

const quarantineRunaway = async (
  input: WriteBackPassInput,
  target: WriteBackTarget,
): Promise<Outcome> => {
  await input.store.quarantineMapping(
    target.sourceCalendarId,
    target.destinationCalendarId,
    "runaway_write_back",
  );
  return "quarantined";
};

const runLockedUpdate = (
  input: WriteBackPassInput,
  target: WriteBackTarget,
  writer: CalendarSourceWriter,
  classification: Extract<InboundClassification, { type: "write-back" }>,
): Promise<{ epoch: number; state: Outcome }> =>
  input.store.withSourceLock(
    target.sourceCalendarId,
    async (locked): Promise<{ epoch: number; state: Outcome }> => {
      if (!await isStillTheStateWeClassified(locked, classification, target)) {
        return { epoch: NO_WORK, state: "abandoned" };
      }

      /*
       * The budget is spent inside the transaction that carries the local commit and
       * before the provider is called: a budget read after the call cannot prevent the
       * call, and a write that then fails rolls the reservation back with everything
       * else the transaction touched.
       */
      const committed = await locked.commitUpdate({
        eventStateId: target.eventStateId,
        mappingId: target.mappingId,
        observed: classification.observed,
        projectedSyncEventHash: classification.projectedSyncEventHash,
        updates: classification.updates,
      });
      if ((committed.writeBackDailyCount ?? NO_WORK) > TWO_WAY_WRITE_BACK_DAILY_CAP) {
        throw new WriteBackDailyCapError(target.mappingId);
      }

      const written = await writer.updateEvent(
        { sourceEventId: target.sourceEventId, sourceEventUid: target.sourceEventUid },
        classification.updates,
        input.signal,
      );
      if (!written.success) {
        throw new Error(written.error ?? "Source write-back failed");
      }

      return { epoch: committed.writeBackEpoch, state: "applied" };
    },
  );

const runBudgetedUpdate = async (
  input: WriteBackPassInput,
  target: WriteBackTarget,
  writer: CalendarSourceWriter,
  classification: Extract<InboundClassification, { type: "write-back" }>,
): Promise<{ epoch: number; state: Outcome } | "over-budget"> => {
  try {
    return await runLockedUpdate(input, target, writer, classification);
  } catch (error) {
    if (error instanceof WriteBackDailyCapError) {
      return "over-budget";
    }
    throw error;
  }
};

const applyUpdate = async (
  input: WriteBackPassInput,
  target: WriteBackTarget,
  writer: CalendarSourceWriter,
  classification: Extract<InboundClassification, { type: "write-back" }>,
): Promise<Outcome> => {
  const outcome = await runBudgetedUpdate(input, target, writer, classification);
  if (outcome === "over-budget") {
    return quarantineRunaway(input, target);
  }
  if (outcome.state === "applied" && outcome.epoch >= TWO_WAY_EPOCH_QUARANTINE_LIMIT) {
    return quarantineRunaway(input, target);
  }
  return outcome.state;
};

/*
 * The mapping is missing from a list read, and a list read has no completeness
 * guarantee. Nothing on the source is destroyed until a targeted read of the copy
 * itself answers not-found: present, unreachable or unimplemented all refuse.
 */
const isAbsenceConfirmed = async (
  input: WriteBackPassInput,
  target: WriteBackTarget,
): Promise<boolean> => {
  const probe = input.store.probeDestinationEvent;
  if (!probe) {
    input.onDeleteBlocked?.({
      mappingId: target.mappingId,
      reason: "probe_unavailable",
    });
    return false;
  }

  const presence = await probe(target);
  if (presence === "absent") {
    return true;
  }
  input.onDeleteBlocked?.({ mappingId: target.mappingId, reason: "still_present" });
  return false;
};

const applyDelete = async (
  input: WriteBackPassInput,
  target: WriteBackTarget,
  writer: CalendarSourceWriter,
  classification: Extract<InboundClassification, { type: "delete" }>,
  now: Date,
): Promise<Outcome> => {
  if (!await isAbsenceConfirmed(input, target)) {
    return "abandoned";
  }

  const recentDeletes = await input.store.countRecentDeletes(
    target.sourceCalendarId,
    new Date(now.getTime() - TWO_WAY_DELETE_DAILY_WINDOW_MS),
  );
  if (recentDeletes >= TWO_WAY_DELETE_DAILY_CAP) {
    await input.store.quarantineMapping(
      target.sourceCalendarId,
      target.destinationCalendarId,
      "delete_daily_cap",
    );
    return "quarantined";
  }

  /*
   * The record of what is about to be destroyed is committed on its own transaction
   * before the provider is asked to destroy it. The advisory lock below is transaction
   * scoped, so it cannot be the same transaction.
   */
  const preSnapshot = await input.store.readSourceEvent(target.eventStateId);
  if (!preSnapshot) {
    return "abandoned";
  }
  const tombstoneId = await input.store.recordTombstone({ snapshot: preSnapshot, target });

  return input.store.withSourceLock(target.sourceCalendarId, async (locked): Promise<Outcome> => {
    if (!await isStillTheStateWeClassified(locked, classification, target)) {
      await input.store.abandonTombstone(tombstoneId);
      return "abandoned";
    }

    const deleted = await writer.deleteEvent(
      { sourceEventId: target.sourceEventId, sourceEventUid: target.sourceEventUid },
      input.signal,
    );
    if (!deleted.success) {
      throw new Error(deleted.error ?? "Source write-back delete failed");
    }

    await locked.commitDelete({
      eventStateId: target.eventStateId,
      mappingId: target.mappingId,
      tombstoneId,
    });
    return "applied";
  });
};

const applyClassification = (
  input: WriteBackPassInput,
  target: WriteBackTarget,
  writer: CalendarSourceWriter,
  classification: ActionableClassification,
  now: Date,
): Promise<Outcome> => {
  if (classification.type === "delete") {
    return applyDelete(input, target, writer, classification, now);
  }
  return applyUpdate(input, target, writer, classification);
};

/*
 * An abandoned attempt makes no progress and leaves everything it was classified from
 * unchanged, so the very same classification is produced again on the next pass. Spending
 * the budget on it is what makes the retry finite: a write-back is refused once the budget
 * is out, and a deletion the copy keeps refusing to confirm becomes a question for the
 * user instead of a request repeated once a minute forever.
 */
const recordNonProgress = async (
  input: WriteBackPassInput,
  target: WriteBackTarget,
  classification: ActionableClassification,
): Promise<boolean> => {
  const spent = await input.store.recordFailure(target.mappingId);
  if (spent < TWO_WAY_EPOCH_QUARANTINE_LIMIT || classification.type !== "delete") {
    return false;
  }
  await input.store.requestDeleteConfirmation?.(
    target.sourceCalendarId,
    target.destinationCalendarId,
    "delete_probe_blocked",
  );
  return true;
};

const runWriteBackPass = async (
  input: WriteBackPassInput,
): Promise<WriteBackPassResult> => {
  const readNow = input.now ?? (() => new Date());
  const startedAt = readNow().getTime();
  const touchedSourceCalendarIds = new Set<string>();
  const quarantinedPairKeys = new Set<string>();
  const result: WriteBackPassResult = {
    abandoned: NO_WORK,
    applied: NO_WORK,
    failed: NO_WORK,
    quarantined: NO_WORK,
    withheld: NO_WORK,
  };
  let attempted = NO_WORK;

  for (const classification of input.classifications) {
    if (!isActionable(classification)) {
      continue;
    }
    if (attempted >= MAX_WRITE_BACKS_PER_PASS) {
      break;
    }
    if (readNow().getTime() - startedAt >= TWO_WAY_WRITE_BACK_PASS_BUDGET_MS) {
      break;
    }
    attempted += 1;
    let failedTarget: WriteBackTarget | null = null;

    try {
      /*
       * A classification nobody can act on is a failure, never a no-op. Skipping it
       * silently would take the write-back branch on every pass with nothing to apply,
       * freezing the destination's ordinary pushes for as long as the source stays
       * unusable, with no counter to show for it.
       */
      const target = await input.store.loadTarget(classification.mappingId);
      if (!target) {
        throw new UnusableSourceError(
          `Event mapping ${classification.mappingId} has no source event to write to`,
        );
      }
      if (quarantinedPairKeys.has(createPairKey(target))) {
        result.withheld += 1;
        continue;
      }
      failedTarget = target;
      const writer = await input.store.resolveWriter(target.sourceCalendarId);
      if (!writer) {
        throw new UnusableSourceError(
          `Source calendar ${target.sourceCalendarId} has no usable write credentials`,
        );
      }

      const outcome = await applyClassification(input, target, writer, classification, readNow());

      result[outcome] += 1;
      if (outcome === "quarantined") {
        quarantinedPairKeys.add(createPairKey(target));
      }
      if (outcome === "applied") {
        touchedSourceCalendarIds.add(target.sourceCalendarId);
      }
      if (outcome === "abandoned") {
        /*
         * Pausing the pair for a human answer is the same decision a quarantine is: the
         * user has been told nothing was deleted and is being asked what happened, so the
         * rest of this pass must not answer the question by destroying the originals.
         */
        const paused = await recordNonProgress(input, target, classification);
        if (paused) {
          quarantinedPairKeys.add(createPairKey(target));
        }
      }
    } catch (error) {
      result.failed += 1;
      input.onError?.(error, { mappingId: classification.mappingId });
      /*
       * The budget is spent against the mapping the classification names rather than
       * against a target, because the failure that loads no target at all is the one that
       * would otherwise repeat untouched on every pass. Only the pair a target identifies
       * can be reverted to one-way.
       */
      const spent = await input.store.recordFailure(classification.mappingId);
      if (failedTarget && spent >= TWO_WAY_EPOCH_QUARANTINE_LIMIT) {
        await input.store.quarantineMapping(
          failedTarget.sourceCalendarId,
          failedTarget.destinationCalendarId,
          "write_back_failing",
        );
        quarantinedPairKeys.add(createPairKey(failedTarget));
        result.quarantined += 1;
      }
    }
  }

  for (const sourceCalendarId of touchedSourceCalendarIds) {
    await input.store.notifySiblings(sourceCalendarId, input.calendarId);
  }

  return result;
};

export { MAX_WRITE_BACKS_PER_PASS, runWriteBackPass };
export type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackPassResult,
  WriteBackStore,
  WriteBackTarget,
};
