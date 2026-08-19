import { describe, expect, it, vi } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";

/*
 * A series whose occurrences all fall outside the provider's default window is
 * excluded from its time-range REPORT (RFC 4791), so it must not become a removal
 * candidate — otherwise the cron pass re-adds it and the two writers thrash forever.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SIX_MONTHS_MS = 180 * DAY_MS;
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

const SERIES_START = new Date(Date.now() - SIX_MONTHS_MS);
const SERIES_FIRST_END = new Date(SERIES_START.getTime() + HOUR_MS);
const SERIES_UNTIL = new Date(Date.now() - FIVE_MONTHS_MS);

const UPSTREAM_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Probe//Probe//EN",
  "BEGIN:VEVENT",
  "UID:ended-weekly-series-1",
  `DTSTAMP:${formatIcsUtc(SERIES_START)}`,
  `DTSTART:${formatIcsUtc(SERIES_START)}`,
  `DTEND:${formatIcsUtc(SERIES_FIRST_END)}`,
  `RRULE:FREQ=WEEKLY;UNTIL=${formatIcsUtc(SERIES_UNTIL)}`,
  "SUMMARY:Ended weekly series",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

interface RequestedRange {
  end: string;
  start: string;
}

/* Emulates the server's time-range REPORT: recurrence-expanded overlap only. */
vi.mock("../../../../src/providers/caldav/shared/client", () => ({
  CalDAVClient: function CalDAVClient() {
    return {
      fetchCalendarDisplayName: () => Promise.resolve(null),
      fetchCalendarObjects: (
        { timeRange }: { timeRange: RequestedRange },
      ): Promise<{ data: string }[]> => {
        const overlaps = SERIES_UNTIL.getTime() > new Date(timeRange.start).getTime()
          && SERIES_START.getTime() < new Date(timeRange.end).getTime();
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
const { parseStoredSourceEventStatesRecoveringInvalid } = await import(
  "../../../../src/core/source/stored-event-state"
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

describe("a CalDAV provider-path sync over a stored recurring series outside the default window", () => {
  it("does not delete the series the cron stored inside the required window when upstream is unchanged", async () => {
    const storedRows = buildCronStoredRows();
    expect(storedRows).toHaveLength(1);
    const parsedStored = parseStoredSourceEventStatesRecoveringInvalid(
      storedRows as Parameters<typeof parseStoredSourceEventStatesRecoveringInvalid>[0],
    );
    expect(parsedStored.failures).toHaveLength(0);

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
