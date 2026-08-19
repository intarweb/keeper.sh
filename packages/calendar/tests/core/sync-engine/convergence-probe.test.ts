import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import { buildEventStateInsertRow } from "../../../src/core/source/write-event-states";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";
import { createCalDAVSourceFetcher } from "../../../src/providers/caldav/source/fetch-adapter";
import { createSourceIngestionPlan } from "../../../src/core/sync/sync-range";

const NOW = new Date("2026-06-15T00:00:00.000Z");
const PLAN = createSourceIngestionPlan("1_month", "2_years", NOW);

const davMocks = vi.hoisted(() => ({
  calendarQuery: vi.fn(),
  fetchCalendarObjects: vi.fn(),
  fetchCalendars: vi.fn(),
}));

vi.mock("tsdav", () => ({
  DAVNamespaceShort: { DAV: "d" },
  createDAVClient: () => Promise.resolve({
    calendarQuery: davMocks.calendarQuery,
    fetchCalendarObjects: davMocks.fetchCalendarObjects,
    fetchCalendars: davMocks.fetchCalendars,
  }),
}));

// Postgres reads an absent optional value back as null, never undefined.
const nullify = <Value,>(value: Value | undefined): Value | null => value ?? null;

let nextRowId = 0;

const persistInsert = (
  calendarId: string,
  event: Parameters<typeof buildEventStateInsertRow>[1],
): StoredSourceEventState => {
  const row = buildEventStateInsertRow(calendarId, event);
  nextRowId += 1;
  return {
    availability: nullify(row.availability),
    description: nullify(row.description),
    endTime: row.endTime,
    exceptionDates: nullify(row.exceptionDates),
    id: `row-${String(nextRowId)}`,
    isAllDay: nullify(row.isAllDay),
    location: nullify(row.location),
    recurrenceId: nullify(row.recurrenceId),
    recurrenceRule: nullify(row.recurrenceRule),
    sourceEventId: nullify(row.sourceEventId),
    sourceEventType: nullify(row.sourceEventType),
    sourceEventUid: row.sourceEventUid,
    startTime: row.startTime,
    startTimeZone: nullify(row.startTimeZone),
    title: nullify(row.title),
  } as StoredSourceEventState;
};

const CALENDAR_ID = "caldav-probe-round2";

const wrap = (bodyLines: string[]): string =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Probe//Probe//EN",
    ...bodyLines,
    "END:VCALENDAR",
  ].join("\r\n");

const buildResources = (overrides: {
  timedSummary?: string;
  overrideStart?: string;
  overrideEnd?: string;
  masterStart?: string;
  masterEnd?: string;
} = {}) => {
  const timedSummary = overrides.timedSummary ?? "Timed";
  const overrideStart = overrides.overrideStart ?? "20260701T110000Z";
  const overrideEnd = overrides.overrideEnd ?? "20260701T113000Z";
  const masterStart = overrides.masterStart ?? "20260624T090000Z";
  const masterEnd = overrides.masterEnd ?? "20260624T093000Z";
  return [
    {
      data: wrap([
        "BEGIN:VEVENT",
        "UID:timed-1",
        "DTSTAMP:20260601T000000Z",
        "DTSTART:20260620T090000Z",
        "DTEND:20260620T100000Z",
        `SUMMARY:${timedSummary}`,
        "END:VEVENT",
      ]),
      url: "/cal/timed-1.ics",
    },
    {
      data: wrap([
        "BEGIN:VEVENT",
        "UID:series-1",
        "DTSTAMP:20260601T000000Z",
        `DTSTART:${masterStart}`,
        `DTEND:${masterEnd}`,
        "RRULE:FREQ=WEEKLY",
        "EXDATE:20260708T090000Z",
        "SUMMARY:Weekly series",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-1",
        "DTSTAMP:20260601T000000Z",
        "RECURRENCE-ID:20260701T090000Z",
        `DTSTART:${overrideStart}`,
        `DTEND:${overrideEnd}`,
        "SUMMARY:Weekly series (moved)",
        "END:VEVENT",
      ]),
      url: "/cal/series-1.ics",
    },
    {
      data: wrap([
        "BEGIN:VEVENT",
        "UID:allday-series-1",
        "DTSTAMP:20260601T000000Z",
        "DTSTART;VALUE=DATE:20260622",
        "DTEND;VALUE=DATE:20260623",
        "RRULE:FREQ=WEEKLY",
        "SUMMARY:All day weekly",
        "END:VEVENT",
      ]),
      url: "/cal/allday-series-1.ics",
    },
  ];
};

interface RoundOutcome {
  added: number;
  removed: number;
  deletedIds: string[];
  insertedUids: string[];
  outcome: unknown;
  store: StoredSourceEventState[];
}

const runRound = async (
  initialStore: readonly StoredSourceEventState[],
): Promise<RoundOutcome> => {
  let store = [...initialStore];
  let outcome: unknown = "";
  const deletedIds: string[] = [];
  const insertedUids: string[] = [];

  const fetcher = createCalDAVSourceFetcher({
    calendarUrl: "https://dav.example.com/cal/",
    password: "password",
    plan: PLAN,
    serverUrl: "https://dav.example.com",
    username: "user",
  });

  const result = await ingestSource({
    calendarId: CALENDAR_ID,
    fetchEvents: () => fetcher.fetchEvents(),
    flush: (changes) => {
      deletedIds.push(...changes.deletes);
      insertedUids.push(...changes.inserts.map((insert) => insert.uid));
      const deleted = new Set(changes.deletes);
      store = [
        ...store.filter((entry) => !deleted.has(entry.id)),
        ...changes.inserts.map((insert) => persistInsert(CALENDAR_ID, insert)),
      ];
      return Promise.resolve();
    },
    onIngestEvent: (event) => {
      ({ outcome } = event);
    },
    readExistingEvents: () => Promise.resolve([...store]),
  });

  return {
    added: result.eventsAdded,
    deletedIds,
    insertedUids,
    outcome,
    removed: result.eventsRemoved,
    store,
  };
};

const mockResources = (resources: ReturnType<typeof buildResources>): void => {
  davMocks.fetchCalendars.mockResolvedValue([
    { displayName: "Cal", url: "https://dav.example.com/cal/" },
  ]);
  davMocks.fetchCalendarObjects.mockResolvedValue(resources);
  davMocks.calendarQuery.mockResolvedValue(
    resources.map((resource) => ({ href: resource.url, props: { getetag: `"${resource.url}"` } })),
  );
};

describe("convergence probe", () => {
  beforeEach(() => {
    nextRowId = 0;
    vi.clearAllMocks();
  });

  it("byte-identical refetch of recurring/exdate/override/all-day is a fixed point", async () => {
    mockResources(buildResources());
    const first = await runRound([]);
    expect(first.added).toBeGreaterThan(0);

    mockResources(buildResources());
    const second = await runRound(first.store);
    expect(
      { added: second.added, removed: second.removed, outcome: second.outcome },
    ).toEqual({ added: 0, removed: 0, outcome: "in-sync" });

    mockResources(buildResources());
    const third = await runRound(second.store);
    expect({ added: third.added, removed: third.removed }).toEqual({ added: 0, removed: 0 });
  });

  it("content perturbation of one timed event is one update-shaped change", async () => {
    mockResources(buildResources());
    const first = await runRound([]);

    mockResources(buildResources({ timedSummary: "Timed renamed" }));
    const second = await runRound(first.store);
    expect(
      {
        added: second.added,
        removed: second.removed,
        deletedIds: second.deletedIds,
        insertedUids: second.insertedUids,
      },
    ).toEqual({ added: 1, removed: 0, deletedIds: [], insertedUids: ["timed-1"] });

    mockResources(buildResources({ timedSummary: "Timed renamed" }));
    const third = await runRound(second.store);
    expect({ added: third.added, removed: third.removed }).toEqual({ added: 0, removed: 0 });
  });

  it("moving an override (same RECURRENCE-ID) is one update-shaped change", async () => {
    mockResources(buildResources());
    const first = await runRound([]);

    mockResources(buildResources({ overrideStart: "20260701T140000Z", overrideEnd: "20260701T143000Z" }));
    const second = await runRound(first.store);
    expect(
      {
        added: second.added,
        removed: second.removed,
        deletedIds: second.deletedIds,
        insertedUids: second.insertedUids,
      },
    ).toEqual({ added: 1, removed: 0, deletedIds: [], insertedUids: ["series-1"] });
  });

  it("rescheduling a recurring master reaches storage as an update, not delete+insert", async () => {
    mockResources(buildResources());
    const first = await runRound([]);

    mockResources(buildResources({ masterStart: "20260624T100000Z", masterEnd: "20260624T103000Z" }));
    const second = await runRound(first.store);
    expect(
      { added: second.added, removed: second.removed, deletedIds: second.deletedIds },
    ).toEqual({ added: 1, removed: 0, deletedIds: [] });
  });
});
