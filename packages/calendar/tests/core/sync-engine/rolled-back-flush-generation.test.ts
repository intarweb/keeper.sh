import { describe, expect, it } from "vitest";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import type { IngestionChanges } from "../../../src/core/sync-engine/ingest";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";
import type { SourceEvent } from "../../../src/core/types";

/*
 * The flush generation may only advance once a snapshot became durable. A bump from
 * a rolled-back transaction would mark the next, fresher flush superseded — reported
 * as success, with no backoff, so an upstream removal silently fails to land.
 */

const CALENDAR_ID = "calendar-rolled-back-flush-generation";

const storedIdFor = (event: SourceEvent): string => `${event.uid}::stored`;

const toStored = (event: SourceEvent): StoredSourceEventState => ({
  availability: event.availability ?? null,
  description: event.description ?? null,
  endTime: event.endTime,
  exceptionDates: null,
  id: storedIdFor(event),
  isAllDay: event.isAllDay ?? false,
  location: event.location ?? null,
  recurrenceId: event.recurrenceId ?? null,
  recurrenceRule: null,
  sourceEventId: event.sourceEventId ?? null,
  sourceEventType: event.sourceEventType ?? "default",
  sourceEventUid: event.uid,
  startTime: event.startTime,
  startTimeZone: event.startTimeZone ?? null,
  title: event.title ?? null,
});

const makeEvent = (uid: string, startHour: number): SourceEvent => ({
  availability: "busy",
  endTime: new Date(Date.UTC(2026, 7, 21, startHour + 1)),
  isAllDay: false,
  startTime: new Date(Date.UTC(2026, 7, 21, startHour)),
  title: uid,
  uid,
});

interface Store {
  rows: StoredSourceEventState[];
}

const applyChanges = (store: Store, changes: IngestionChanges): void => {
  const deleted = new Set(changes.deletes);
  store.rows = store.rows.filter((row) => !deleted.has(row.id));
  store.rows = [...store.rows, ...changes.inserts.map(toStored)];
};

describe("flush generation across a rolled-back transaction", () => {
  it("a transaction that rolls back after issuing its writes must not mark fresher queued flushes superseded", async () => {
    const eventX = makeEvent("event-x", 9);
    const eventY = makeEvent("event-y", 13);

    const store: Store = { rows: [toStored(eventX), toStored(eventY)] };

    const { promise: fetchGate, resolve: releaseFetch } =
      Promise.withResolvers<null>();
    const { promise: fetchStarted, resolve: markFetchStarted } =
      Promise.withResolvers<null>();

    const freshRun = ingestSource({
      calendarId: CALENDAR_ID,
      fetchEvents: async () => {
        markFetchStarted(null);
        await fetchGate;
        return { events: [eventX] };
      },
      readExistingEvents: () => Promise.resolve([...store.rows]),
      flush: (changes) => {
        applyChanges(store, changes);
        return Promise.resolve();
      },
    });

    await fetchStarted;

    /*
     * Run A issues its statements, then the transaction rolls back: the post-work
     * signal.throwIfAborted() in createIngestionPersistenceTransaction fires, or
     * COMMIT itself fails.
     */
    const rolledBack = await ingestSource({
      calendarId: CALENDAR_ID,
      fetchEvents: () => Promise.resolve({
        events: [eventX, eventY],
        snapshot: { contentHash: "hash-a", ical: "BEGIN:VCALENDAR" },
      }),
      withPersistenceTransaction: async (work) => {
        await work({
          readExistingEvents: () => Promise.resolve([...store.rows]),
          flush: () => Promise.resolve(),
        });
        throw new Error("transaction rolled back after commitChanges");
      },
    }).catch((error: unknown) => error);
    expect(rolledBack).toBeInstanceOf(Error);
    expect(store.rows.map((row) => row.sourceEventUid).toSorted())
      .toEqual(["event-x", "event-y"]);

    releaseFetch(null);
    const freshResult = await freshRun;

    /* No writer committed since B's fetch began, so B's fresh snapshot must land. */
    expect(freshResult.eventsRemoved).toBe(1);
    expect(store.rows.map((row) => row.sourceEventUid)).toEqual(["event-x"]);
  });
});
