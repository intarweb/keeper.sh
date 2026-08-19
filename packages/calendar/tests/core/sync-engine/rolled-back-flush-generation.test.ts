import { describe, expect, it } from "vitest";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import type { IngestionChanges } from "../../../src/core/sync-engine/ingest";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";
import type { SourceEvent } from "../../../src/core/types";

/*
 * Ingest.ts wraps the persistence flush as:
 *
 *   const flush = async (changes) => {
 *     await commitChanges(changes);
 *     bumpFlushGeneration(calendarId);
 *   };
 *
 * In the cron persistence transaction (ingest-sources.ts
 * createIngestionPersistenceTransaction) `commitChanges` only ISSUES the
 * statements inside a still-open flushDatabase.transaction. The transaction
 * commits after the work callback returns — and it can still roll back after
 * commitChanges resolved: the post-work `signal.throwIfAborted()` fires when
 * the source deadline expired during the final write batch, or COMMIT itself
 * fails. In every such case nothing was persisted, yet the calendar's flush
 * generation was already bumped.
 *
 * Invariant under attack: the generation may only advance when a snapshot
 * actually became durable. A phantom bump makes the next queued flush — a
 * FRESHER fetch — probe `isFlushSuperseded` against a generation that
 * corresponds to no committed data, discard its snapshot as superseded, and
 * report success ("superseded" is not an error, applies no backoff), so an
 * upstream removal silently fails to land.
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

    /* Committed state and upstream both start as [X, Y]. */
    const store: Store = { rows: [toStored(eventX), toStored(eventY)] };

    const { promise: fetchGate, resolve: releaseFetch } =
      Promise.withResolvers<null>();
    const { promise: fetchStarted, resolve: markFetchStarted } =
      Promise.withResolvers<null>();

    /*
     * Run B captures its observed flush generation, then parks in its provider
     * fetch (its fetch will return the FRESH snapshot [X] — upstream removed Y
     * while B's request was in flight).
     */
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
     * Run A: an overlapping run of the same calendar (timeout-abandoned run
     * from the previous pass, or drain-pending-ingest against the cron pass).
     * Its fetch sees the unchanged snapshot [X, Y] plus a snapshot/token write,
     * so it flushes. The statements are issued (commitChanges resolves, the
     * generation is bumped), then the transaction ROLLS BACK: the post-work
     * signal.throwIfAborted() in createIngestionPersistenceTransaction fires,
     * or COMMIT fails. Nothing became durable.
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
    /* Rollback means the committed state is untouched. */
    expect(store.rows.map((row) => row.sourceEventUid).toSorted())
      .toEqual(["event-x", "event-y"]);

    /* B's fetch completes with the fresh snapshot [X] and its flush runs. */
    releaseFetch(null);
    const freshResult = await freshRun;

    /*
     * The fresh snapshot must land: upstream removed Y, and no other writer
     * committed anything since B's fetch began. If the rolled-back run's
     * phantom generation bump marks B superseded, Y survives in the database
     * with no upstream change backing it.
     */
    expect(freshResult.eventsRemoved).toBe(1);
    expect(store.rows.map((row) => row.sourceEventUid)).toEqual(["event-x"]);
  });
});
