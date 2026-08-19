import { describe, expect, it } from "vitest";
import type { IngestionChanges } from "../../../src/core/sync-engine/ingest";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { EventMapping } from "../../../src/core/events/mappings";
import type {
  MaterializedSyncableEvent,
  RemoteEvent,
  SourceEvent,
} from "../../../src/core/types";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";

/*
 * A user reschedules a plain one-off CalDAV event upstream: same UID, new
 * start/end. Nothing else about the event changed. The CalDAV source path
 * builds SourceEvents with no sourceEventId (providers/caldav/source/window.ts
 * toSourceEvent), so storage identity is the slot instance key
 * `slot|uid|start|end`, which the reschedule changes.
 */
const EVENT_UID = "standup@example.com";
const SOURCE_CALENDAR_ID = "source-cal-reschedule";
const ORIGINAL_START = new Date("2026-09-01T10:00:00.000Z");
const ORIGINAL_END = new Date("2026-09-01T11:00:00.000Z");
const MOVED_START = new Date("2026-09-01T14:00:00.000Z");
const MOVED_END = new Date("2026-09-01T15:00:00.000Z");

const storedOriginalState: StoredSourceEventState = {
  availability: null,
  description: null,
  endTime: ORIGINAL_END,
  exceptionDates: null,
  id: "state-old",
  isAllDay: null,
  location: null,
  recurrenceId: null,
  recurrenceRule: null,
  sourceEventId: null,
  sourceEventType: null,
  sourceEventUid: EVENT_UID,
  startTime: ORIGINAL_START,
  startTimeZone: null,
  title: "Standup",
};

const rescheduledSourceEvent: SourceEvent = {
  endTime: MOVED_END,
  startTime: MOVED_START,
  title: "Standup",
  uid: EVENT_UID,
};

const runRescheduleIngest = async (): Promise<IngestionChanges> => {
  const flushes: IngestionChanges[] = [];

  await ingestSource({
    calendarId: SOURCE_CALENDAR_ID,
    fetchEvents: () => Promise.resolve({
      events: [rescheduledSourceEvent],
      isDeltaSync: false,
    }),
    flush: (changes) => {
      flushes.push(changes);
      return Promise.resolve();
    },
    readExistingEvents: () => Promise.resolve([storedOriginalState]),
  });

  const [changes] = flushes;
  if (!changes) {
    throw new Error("Reschedule ingest flushed no changes");
  }
  return changes;
};

describe("rescheduling a non-recurring CalDAV event", () => {
  it("updates the stored event state in place instead of delete+insert", async () => {
    const changes = await runRescheduleIngest();

    /*
     * One upstream reschedule of one event should be carried as one in-place
     * change to the stored state. Deleting the old row and inserting a new one
     * gives the replacement row a fresh id, which severs the event mapping
     * (event_mappings.eventStateId is onDelete: "set null") and cascades into
     * destination delete+create churn, proven by the next test.
     */
    expect(changes.deletes).toHaveLength(0);
  });

  it("reaches the destination as one in-place replace, not delete+create", async () => {
    const changes = await runRescheduleIngest();

    /*
     * Apply the flush the way persistence does. The inserted replacement row
     * gets a fresh id; deleting the old row nulls eventStateId on the mapping
     * that mirrors this event (packages/database schema: onDelete "set null").
     */
    const [insertedEvent] = changes.inserts;
    if (!insertedEvent) {
      throw new Error("Reschedule ingest inserted no replacement state");
    }
    let mappingEventStateId: string | null = storedOriginalState.id;
    if (changes.deletes.includes(storedOriginalState.id)) {
      mappingEventStateId = null;
    }

    // The materialized local read after the flush: id is the event_states row id.
    const localEvents: MaterializedSyncableEvent[] = [
      {
        calendarId: SOURCE_CALENDAR_ID,
        calendarName: null,
        calendarUrl: null,
        endTime: insertedEvent.endTime,
        eventStateId: "state-new",
        id: "state-new",
        sourceEventUid: insertedEvent.uid,
        startTime: insertedEvent.startTime,
        summary: "Standup",
      },
    ];

    // The mapping and destination copy written when the event was first synced.
    const existingMappings: EventMapping[] = [
      {
        calendarId: "destination-cal",
        deleteIdentifier: "delete-1",
        destinationEventUid: "keeper-standup-uid",
        endTime: ORIGINAL_END,
        eventStateId: mappingEventStateId,
        id: "mapping-1",
        sourceCalendarId: SOURCE_CALENDAR_ID,
        startTime: ORIGINAL_START,
        syncEventHash: null,
        syncEventId: storedOriginalState.id,
      },
    ];
    const remoteEvents: RemoteEvent[] = [
      {
        deleteId: "delete-1",
        endTime: ORIGINAL_END,
        isKeeperEvent: true,
        startTime: ORIGINAL_START,
        uid: "keeper-standup-uid",
      },
    ];

    const window = {
      timeMax: new Date("2026-10-01T00:00:00.000Z"),
      timeMin: new Date("2026-08-01T00:00:00.000Z"),
    };
    const { operations } = computeSyncOperations(
      localEvents,
      existingMappings,
      remoteEvents,
      { authoritativeWindow: window, requestedWindow: window },
    );

    /*
     * The destination already holds this event; a moved start time should be
     * pushed as a single in-place replace reusing the existing destination
     * UID. A remove+add pair recreates the event at the destination, which is
     * attendee-visible churn (cancellation plus fresh invite).
     */
    const operationTypes = operations
      .map((operation) => operation.type)
      .toSorted();
    expect(operationTypes).toEqual(["replace"]);
  });
});
