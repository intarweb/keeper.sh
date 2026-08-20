import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Every gated read queues at a tiny lane permit pool, so the pass between lock acquisition
 * and the provider work must pay for exactly ONE calendars-row read: the merged read that
 * serves both the backoff gate and the currentSource data. The row handed to the family
 * work MUST be the one that merged read returned — post-lock, never the pre-fan-out
 * listing — and the backoff bookkeeping must key off that same row's failure count.
 */
const harness = vi.hoisted(() => {
  const state = {
    backoffWriteCounts: [] as number[],
    fetcherExternalCalendarIds: [] as (string | undefined)[],
    ingestCalls: 0,
    ingestError: null as Error | null,
    lockAcquired: false,
    /* Rows served to the merged post-lock read; null keeps the default fresh row. */
    mergedRows: null as unknown[] | null,
    postLockCalendarRowReads: 0,
    resetWrites: 0,
  };

  const FUTURE_EXPIRY_MS = 3_600_000;

  const baseSource = {
    accountId: "account-1",
    accessToken: "access-token",
    calendarId: "calendar-1",
    expiresAt: new Date(Date.now() + FUTURE_EXPIRY_MS),
    ingestFutureRange: "6m",
    ingestHistoricRange: "1m",
    ingestWindowEnd: null,
    ingestWindowRecordedAt: null,
    ingestWindowStart: null,
    oauthCredentialId: "credential-1",
    provider: "outlook",
    reauthenticationSource: null,
    refreshToken: "refresh-token",
    syncToken: null,
    userId: "user-1",
  };

  /* The pre-fan-out listing row: its external id must never reach the fetcher. */
  const listingRow = { ...baseSource, externalCalendarId: "listing-external" };

  /*
   * The legacy second read (currentSource without backoff fields): a distinct marker so
   * reintroducing it is visible as the wrong row reaching the fetcher.
   */
  const legacySecondReadRow = { ...baseSource, externalCalendarId: "second-read-external" };

  /* The merged post-lock read: backoff fields and source data in one row. */
  const freshMergedRow = {
    ...baseSource,
    externalCalendarId: "fresh-external",
    ingestFailureCount: 0,
    ingestNextAttemptAt: null,
  };

  const resolveLimited = (fields: Record<string, unknown>): unknown[] => {
    if (state.lockAcquired) {
      state.postLockCalendarRowReads += 1;
    }
    if ("ingestFailureCount" in fields && "accessToken" in fields) {
      return state.mergedRows ?? [freshMergedRow];
    }
    /* The legacy pre-work backoff gate read. */
    if ("failureCount" in fields) {
      return [{ failureCount: 0, nextAttemptAt: null }];
    }
    if ("accessToken" in fields) {
      return [legacySecondReadRow];
    }
    return [];
  };

  const resolveListing = (fields: Record<string, unknown>): unknown[] => {
    if ("reauthenticationSource" in fields) {
      return [listingRow];
    }
    return [];
  };

  const createQueryBuilder = (fields: Record<string, unknown>) => {
    const builder: Record<string, unknown> = {};
    const chain = (): unknown => builder;
    builder.from = chain;
    builder.innerJoin = chain;
    builder.leftJoin = chain;
    const resolveBare = (): unknown[] => {
      if ("count" in fields) {
        return [{ count: 0 }];
      }
      return [];
    };
    builder.where = () =>
      Object.assign(Promise.resolve(resolveBare()), {
        limit: () => Promise.resolve(resolveLimited(fields)),
        orderBy: () => Promise.resolve(resolveListing(fields)),
      });
    return builder;
  };

  const updateBuilder = {
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if ("ingestFailureCount" in values) {
          if (values.ingestFailureCount === 0) {
            state.resetWrites += 1;
          } else {
            state.backoffWriteCounts.push(Number(values.ingestFailureCount));
          }
        }
        return Object.assign(Promise.resolve([]), {
          returning: () => Promise.resolve([]),
        });
      },
    }),
  };

  const database = {
    select: (fields: Record<string, unknown>) => createQueryBuilder(fields),
    update: () => updateBuilder,
  };

  const flushDatabase = {
    select: (fields: Record<string, unknown>) => createQueryBuilder(fields),
    transaction: (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({ execute: () => Promise.resolve([]) }),
    update: () => updateBuilder,
  };

  const createOutlookAccountSemaphore = vi.fn(() => ({
    acquireLease: () => Promise.resolve({ key: "lease-key", token: "lease-token" }),
    release: (): Promise<void> => Promise.resolve(),
  }));

  const ingestSource = async (options: {
    fetchEvents: () => Promise<unknown>;
    isCurrent?: () => Promise<boolean>;
  }): Promise<{ eventsAdded: number; eventsRemoved: number }> => {
    state.ingestCalls += 1;
    if (state.ingestError) {
      throw state.ingestError;
    }
    await options.fetchEvents();
    await options.isCurrent?.();
    return { eventsAdded: 0, eventsRemoved: 0 };
  };

  const createSyncLock = () => ({
    acquire: () => {
      state.lockAcquired = true;
      return Promise.resolve({
        acquired: true,
        handle: {
          isCurrent: () => Promise.resolve(true),
          isHeld: () => Promise.resolve(true),
          release: () => Promise.resolve(),
        },
      });
    },
  });

  const createOutlookSourceFetcher = (params: { externalCalendarId?: string }) => {
    state.fetcherExternalCalendarIds.push(params.externalCalendarId);
    return {
      fetchEvents: (): Promise<unknown> => Promise.resolve({ events: [] }),
    };
  };

  return {
    createOutlookAccountSemaphore,
    createOutlookSourceFetcher,
    createSyncLock,
    database,
    flushDatabase,
    freshMergedRow,
    ingestSource,
    state,
  };
});

vi.mock("@keeper.sh/calendar", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createOutlookAccountSemaphore: harness.createOutlookAccountSemaphore,
    ingestSource: harness.ingestSource,
  };
});

vi.mock("@keeper.sh/calendar/outlook", () => ({
  createOutlookSourceFetcher: harness.createOutlookSourceFetcher,
}));

vi.mock("@keeper.sh/sync", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createSyncLock: harness.createSyncLock };
});

/* No client secrets, so the token-refresh branch is skipped entirely. */
vi.mock("../../src/env", () => ({ default: {} }));
vi.mock("../../src/context", () => ({
  database: harness.database,
  flushDatabase: harness.flushDatabase,
  flushDrainRegistry: { register: (): null => null },
  premiumService: { getUserPlan: () => Promise.resolve("pro") },
  refreshLockRedis: {
    call: () => Promise.resolve("OK"),
    del: () => Promise.resolve(1),
    eval: () => Promise.resolve([0, 0]),
    get: () => Promise.resolve(null),
  },
  refreshLockStore: {
    release: () => Promise.resolve(),
    tryAcquire: () => Promise.resolve(true),
  },
}));
vi.mock("../../src/utils/logging", () => ({
  context: (callback: () => unknown) => callback(),
  widelog: {
    append: () => null,
    count: () => null,
    error: () => null,
    errorFields: () => null,
    flush: () => null,
    max: () => null,
    min: () => null,
    set: () => null,
    setFields: () => null,
    time: { measure: (_key: string, callback: () => unknown) => callback() },
  },
}));
vi.mock("../../src/utils/enqueue-destination-syncs", () => ({
  enqueueDestinationSyncsForUsers: () => Promise.resolve(0),
}));

interface IngestionBatchResult {
  added: number;
  affectedUserIds: string[];
  errors: number;
  firstIngestUserIds: string[];
  removed: number;
}

type IngestOAuthSources = (calendarIds?: string[]) => Promise<IngestionBatchResult>;

let ingestOAuthSources: IngestOAuthSources = () => {
  throw new Error("Module not loaded");
};

beforeAll(async () => {
  const module = await import("../../src/jobs/ingest-sources") as unknown as Record<
    string,
    unknown
  >;
  expect(typeof module.ingestOAuthSources).toBe("function");
  ingestOAuthSources = module.ingestOAuthSources as IngestOAuthSources;
});

beforeEach(() => {
  harness.state.backoffWriteCounts.length = 0;
  harness.state.fetcherExternalCalendarIds.length = 0;
  harness.state.ingestCalls = 0;
  harness.state.ingestError = null;
  harness.state.lockAcquired = false;
  harness.state.mergedRows = null;
  harness.state.postLockCalendarRowReads = 0;
  harness.state.resetWrites = 0;
});

describe("single post-lock calendars-row read", () => {
  it("performs exactly one calendars-row read between lock acquisition and the work", async () => {
    await ingestOAuthSources();

    expect(harness.state.ingestCalls).toBe(1);
    expect(harness.state.postLockCalendarRowReads).toBe(1);
  });

  it("skips the work without invoking it when nextAttemptAt is in the future", async () => {
    harness.state.mergedRows = [{
      ...harness.freshMergedRow,
      ingestFailureCount: 2,
      ingestNextAttemptAt: new Date(Date.now() + 3_600_000),
    }];

    const result = await ingestOAuthSources();

    expect(harness.state.ingestCalls).toBe(0);
    expect(harness.state.fetcherExternalCalendarIds).toEqual([]);
    /* A parked calendar is a skip, never an error or a pass. */
    expect(result.errors).toBe(0);
    expect(result.affectedUserIds).toEqual([]);
    expect(result.firstIngestUserIds).toEqual([]);
  });

  it("skips the work without invoking it when the post-lock read finds no row", async () => {
    harness.state.mergedRows = [];

    const result = await ingestOAuthSources();

    expect(harness.state.ingestCalls).toBe(0);
    expect(harness.state.fetcherExternalCalendarIds).toEqual([]);
    expect(result.errors).toBe(0);
    expect(result.affectedUserIds).toEqual([]);
    expect(result.firstIngestUserIds).toEqual([]);
  });

  it("hands the work the row the post-lock read returned, never listing data", async () => {
    await ingestOAuthSources();

    expect(harness.state.fetcherExternalCalendarIds).toEqual(["fresh-external"]);
  });

  it("applies backoff using the failure count from the merged post-lock read", async () => {
    harness.state.mergedRows = [{ ...harness.freshMergedRow, ingestFailureCount: 3 }];
    harness.state.ingestError = new Error("provider exploded");

    const result = await ingestOAuthSources();

    expect(result.errors).toBe(1);
    /* buildCalendarBackoffState(3) escalates to 4; a stale count would write 1. */
    expect(harness.state.backoffWriteCounts).toEqual([4]);
  });

  it("resets backoff after a success when the merged read carried failures", async () => {
    harness.state.mergedRows = [{ ...harness.freshMergedRow, ingestFailureCount: 3 }];

    const result = await ingestOAuthSources();

    expect(result.errors).toBe(0);
    expect(harness.state.resetWrites).toBe(1);
  });
});
