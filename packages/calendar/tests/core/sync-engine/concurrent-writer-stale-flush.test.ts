import { describe, expect, it } from "vitest";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import type { IngestionChanges } from "../../../src/core/sync-engine/ingest";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";
import type { SourceEvent } from "../../../src/core/types";
import { createFlushGenerationTracker } from "../../../src/core/sync-engine/flush-generations";
import type { FlushGenerationTracker } from "../../../src/core/sync-engine/flush-generations";

/*
 * The two writers of one calendar share only the Postgres advisory lock, so a cron
 * flush can sit parked while a fresher snapshot commits. Its stale payload must not
 * then land as authoritative and undo the fresher writer's work.
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

const runImmediateWriter = (
  store: Store,
  events: SourceEvent[],
  flushGenerations: FlushGenerationTracker,
): Promise<{ eventsAdded: number; eventsRemoved: number }> =>
  ingestSource({
    calendarId: CALENDAR_ID,
    fetchEvents: () => Promise.resolve({ events }),
    flushGenerations,
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
    const flushGenerations = createFlushGenerationTracker();

    const { promise: gate, resolve: releaseGate } = Promise.withResolvers<null>();

    const cronRun = ingestSource({
      calendarId: CALENDAR_ID,
      fetchEvents: () => Promise.resolve({ events: [eventX] }),
      flushGenerations,
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

    const freshResult = await runImmediateWriter(store, [eventX, eventY], flushGenerations);
    expect(freshResult.eventsAdded).toBe(1);
    expect(store.rows.map((row) => row.sourceEventUid).toSorted())
      .toEqual(["event-x", "event-y"]);

    releaseGate(null);
    await cronRun;

    /* Upstream is unchanged since the freshest commit, so re-ingesting must be a no-op. */
    const repeat = await runImmediateWriter(store, [eventX, eventY], flushGenerations);
    expect(repeat.eventsAdded).toBe(0);
    expect(repeat.eventsRemoved).toBe(0);
  });
});
