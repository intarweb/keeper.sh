import { describe, expect, it, vi } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";

/*
 * The cron ingest fetches this calendar under a destination-widened window, so an
 * event it stored outside the provider's narrower default window must survive a
 * provider-path sync — otherwise the two writers delete and re-add it forever.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const FIVE_MONTHS_MS = 150 * DAY_MS;

const pad = (value: number): string => String(value).padStart(2, "0");

const formatIcsUtc = (date: Date): string => [
  String(date.getUTCFullYear()),
  pad(date.getUTCMonth() + 1),
  pad(date.getUTCDate()),
  "T",
  pad(date.getUTCHours()),
  pad(date.getUTCMinutes()),
  pad(date.getUTCSeconds()),
  "Z",
].join("");

const EVENT_START = new Date(Date.now() - FIVE_MONTHS_MS);
const EVENT_END = new Date(EVENT_START.getTime() + HOUR_MS);

const UPSTREAM_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Probe//Probe//EN",
  "BEGIN:VEVENT",
  "UID:quarterly-review-1",
  `DTSTAMP:${formatIcsUtc(EVENT_START)}`,
  `DTSTART:${formatIcsUtc(EVENT_START)}`,
  `DTEND:${formatIcsUtc(EVENT_END)}`,
  "SUMMARY:Quarterly review",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

interface RequestedRange {
  end: string;
  start: string;
}

const requestedRanges: RequestedRange[] = [];

/* Emulates the server's time-range REPORT: only objects overlapping the range. */
vi.mock("../../../../src/providers/caldav/shared/client", () => ({
  CalDAVClient: function CalDAVClient() {
    return {
      fetchCalendarDisplayName: () => Promise.resolve(null),
      fetchCalendarObjects: (
        { timeRange }: { timeRange: RequestedRange },
      ): Promise<{ data: string }[]> => {
        requestedRanges.push(timeRange);
        const overlaps = EVENT_END.getTime() > new Date(timeRange.start).getTime()
          && EVENT_START.getTime() < new Date(timeRange.end).getTime();
        if (overlaps) {
          return Promise.resolve([{ data: UPSTREAM_ICS }]);
        }
        return Promise.resolve([]);
      },
      resolveCalendarUrl: (url: string) => Promise.resolve(url),
    };
  },
}));

vi.mock("@keeper.sh/database", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  decryptPassword: () => "plaintext",
}));

const { createCalDAVSourceProvider } = await import(
  "../../../../src/providers/caldav/source/provider"
);
const { parseICalCalendarsToRemoteEvents } = await import(
  "../../../../src/providers/caldav/shared/ics"
);
const { partitionCalDAVSourceEvents } = await import(
  "../../../../src/providers/caldav/source/window"
);
const { createRequiredSourceRanges } = await import(
  "../../../../src/core/sync/required-source-ranges"
);
const { getConfigurableSyncWindow } = await import(
  "../../../../src/core/sync/sync-range"
);
const { buildSourceEventsToAdd } = await import(
  "../../../../src/core/source/event-diff"
);
const { buildEventStateInsertRow } = await import(
  "../../../../src/core/source/write-event-states"
);

const CALENDAR_ID = "calendar-1";

const SOURCE_ROW = {
  authMethod: "basic",
  calendarAccountId: "account-1",
  calendarId: CALENDAR_ID,
  calendarUrl: "https://dav.example.com/cal/",
  encryptedPassword: "cipher",
  name: "Calendar",
  originalName: "Calendar",
  provider: "caldav",
  serverUrl: "https://dav.example.com/",
  syncToken: null,
  userId: "user-1",
};

/* Replays what the cron ingest stores: a fetch partitioned by the destination-widened window. */
const buildCronStoredRows = (): Record<string, unknown>[] => {
  const ranges = createRequiredSourceRanges([
    { syncFutureRange: "2_years", syncHistoricRange: "12_months" },
  ]);
  const cronWindow = getConfigurableSyncWindow(ranges.historicRange, ranges.futureRange);
  const parsed = parseICalCalendarsToRemoteEvents([UPSTREAM_ICS]);
  const cronEvents = partitionCalDAVSourceEvents(parsed.events, cronWindow).events;
  const eventsToAdd = buildSourceEventsToAdd([], cronEvents, { isDeltaSync: false });
  return eventsToAdd.map((event, index) => {
    const row = buildEventStateInsertRow(CALENDAR_ID, event);
    return {
      ...row,
      id: `stored-${index}`,
      recurrenceId: row.recurrenceId ?? null,
      recurrenceRule: row.recurrenceRule ?? null,
      sourceEventId: row.sourceEventId ?? null,
      sourceEventType: row.sourceEventType ?? null,
    };
  });
};

const createChain = (resolve: () => unknown): unknown => {
  const chain: Record<string, unknown> = {};
  return new Proxy(chain, {
    get(_target, property) {
      if (property === "then") {
        return (
          onFulfilled: (value: unknown) => unknown,
          onRejected: (reason: unknown) => unknown,
        ) => Promise.resolve().then(resolve).then(onFulfilled).catch(onRejected);
      }
      return () => createChain(resolve);
    },
  });
};

interface FakeDatabase {
  database: BunSQLDatabase;
  eventStateSelects: () => number;
  flushDeleteCalls: () => number;
  swallowedErrors: unknown[];
}

const createFakeDatabase = (storedRows: Record<string, unknown>[]): FakeDatabase => {
  let eventStateSelectCount = 0;
  let deleteCount = 0;
  const swallowedErrors: unknown[] = [];

  const resolveSelect = (projection: Record<string, unknown>): unknown[] => {
    const keys = new Set(Object.keys(projection));
    if (keys.has("calendarAccountId")) {
      return [SOURCE_ROW];
    }
    if (keys.has("sourceEventUid")) {
      eventStateSelectCount += 1;
      return storedRows;
    }
    throw new Error(`unexpected select projection: ${[...keys].join(",")}`);
  };

  const flushTransaction = {
    delete: () => ({
      where: () => {
        deleteCount += 1;
        return Promise.resolve([]);
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve([]),
      }),
    }),
    select: (projection: Record<string, unknown>) => createChain(() => resolveSelect(projection)),
    update: () => ({
      set: () => ({ where: () => Promise.resolve([]) }),
    }),
  };

  const lockedDatabase = {
    ...flushTransaction,
    execute: () => Promise.resolve([]),
    transaction: (work: (transaction: unknown) => Promise<unknown>) => work(flushTransaction),
  };

  const database = {
    select: (projection: Record<string, unknown>) => createChain(() => resolveSelect(projection)),
    transaction: async (work: (transaction: unknown) => Promise<unknown>) => {
      try {
        return await work(lockedDatabase);
      } catch (error) {
        swallowedErrors.push(error);
        throw error;
      }
    },
    update: () => ({
      set: () => ({ where: () => Promise.resolve([]) }),
    }),
  } as unknown as BunSQLDatabase;

  return {
    database,
    eventStateSelects: () => eventStateSelectCount,
    flushDeleteCalls: () => deleteCount,
    swallowedErrors,
  };
};

describe("a CalDAV provider-path sync after a cron ingest under destination-widened ranges", () => {
  it("does not delete events the cron stored inside the required window when upstream is unchanged", async () => {
    const storedRows = buildCronStoredRows();
    expect(storedRows).toHaveLength(1);

    const fake = createFakeDatabase(storedRows);
    const provider = createCalDAVSourceProvider({
      database: fake.database,
      encryptionKey: "0".repeat(64),
    });

    const result = await provider.syncSource(CALENDAR_ID);

    expect(fake.swallowedErrors).toEqual([]);
    expect(fake.eventStateSelects()).toBe(1);
    /* Upstream is byte-identical to what the cron ingested, so this sync must be a no-op. */
    expect(fake.flushDeleteCalls()).toBe(0);
    expect(result.eventsRemoved).toBe(0);
  });
});
