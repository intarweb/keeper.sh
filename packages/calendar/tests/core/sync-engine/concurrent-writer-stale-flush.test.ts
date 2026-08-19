import { describe, expect, it } from "vitest";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import type { IngestionChanges } from "../../../src/core/sync-engine/ingest";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";
import type { SourceEvent } from "../../../src/core/types";

/*
 * Two writers, one calendar. The cron ingest holds the Redis source-ingest
 * lock, but the CalDAV source provider persist path
 * (packages/calendar/src/providers/caldav/source/provider.ts syncSingleSource)
 * serializes ONLY on the Postgres advisory lock. Cron's flush thunk can sit
 * parked in the serial flush queue (behind up to 50 flushes) after its fetch
 * completed; the caldav-path writer can acquire the advisory lock, commit a
 * FRESHER snapshot, and release, all while cron's fetched payload waits. When
 * cron's flush finally acquires the advisory lock (within the 5s wait bound),
 * it diffs its STALE fetch against the fresh store and persists the stale
 * fetch as authoritative: events the fresher writer added are deleted, events
 * it removed are resurrected. The next pass undoes that again — sync thrash.
 *
 * Both writers here run the real ingest diff engine; the interleaving models
 * exactly the ordering the advisory lock permits.
 */

const CALENDAR_ID = "calendar-concurrent-writers";

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
  endTime: new Date(Date.UTC(2026, 6, 1, startHour + 1)),
  isAllDay: false,
  startTime: new Date(Date.UTC(2026, 6, 1, startHour)),
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

/*
 * A writer whose flush commits immediately, the way the caldav provider path
 * and an unparked cron flush do: read under the lock, diff, commit.
 */
const runImmediateWriter = (
  store: Store,
  events: SourceEvent[],
): Promise<{ eventsAdded: number; eventsRemoved: number }> =>
  ingestSource({
    calendarId: CALENDAR_ID,
    fetchEvents: () => Promise.resolve({ events }),
    readExistingEvents: () => Promise.resolve([...store.rows]),
    flush: (changes) => {
      applyChanges(store, changes);
      return Promise.resolve();
    },
  });

describe("concurrent writers on one calendar", () => {
  it("a parked cron flush must not persist its stale fetch over a fresher committed snapshot", async () => {
    const eventX = makeEvent("event-x", 9);
    const eventY = makeEvent("event-y", 13);

    const store: Store = { rows: [toStored(eventX)] };

    /*
     * Cron run C fetches while upstream is [X]. Its persistence transaction is
     * parked (serial flush queue + advisory lock), exactly as
     * createIngestionPersistenceTransaction parks the whole thunk including
     * readExistingEvents until the flush worker runs it.
     */
    const { promise: gate, resolve: releaseGate } = Promise.withResolvers<null>();

    const cronRun = ingestSource({
      calendarId: CALENDAR_ID,
      fetchEvents: () => Promise.resolve({ events: [eventX] }),
      withPersistenceTransaction: async (work) => {
        await gate;
        return work({
          readExistingEvents: () => Promise.resolve([...store.rows]),
          flush: (changes) => {
            applyChanges(store, changes);
            return Promise.resolve();
          },
        });
      },
    });

    /*
     * Upstream gains Y. The caldav-path writer S (no Redis lock, advisory lock
     * only) fetches the fresher snapshot [X, Y] and commits it while C's flush
     * is still parked.
     */
    const freshResult = await runImmediateWriter(store, [eventX, eventY]);
    expect(freshResult.eventsAdded).toBe(1);
    expect(store.rows.map((row) => row.sourceEventUid).toSorted())
      .toEqual(["event-x", "event-y"]);

    /* The advisory lock frees; C's parked flush now runs with its stale fetch. */
    releaseGate(null);
    await cronRun;

    /*
     * Convergence invariant: upstream is [X, Y] and the freshest snapshot of
     * [X, Y] was already committed, so re-ingesting the SAME upstream state
     * must be a no-op. It is not: C's stale flush deleted Y, so the repeat
     * ingest re-adds it — an upstream-stable calendar produced a remove/add
     * pair on the destination.
     */
    const repeat = await runImmediateWriter(store, [eventX, eventY]);
    expect(repeat.eventsAdded).toBe(0);
    expect(repeat.eventsRemoved).toBe(0);
  });
});
