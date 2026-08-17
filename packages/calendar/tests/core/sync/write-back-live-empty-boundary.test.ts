import { describe, expect, it } from "vitest";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import { classifyInboundChanges } from "../../../src/core/sync/write-back";
import type { WriteBackPolicy } from "../../../src/core/sync/write-back-policy";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
} from "../../../src/core/events/content-hash";
import type { EventMapping } from "../../../src/core/events/mappings";
import type {
  EventAvailability,
  MaterializedSyncableEvent,
  RemoteEvent,
} from "../../../src/core/types";

const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");

const TEST_WINDOW = {
  timeMax: new Date("2100-01-01T00:00:00.000Z"),
  timeMin: new Date("2000-01-01T00:00:00.000Z"),
};

type TwoWayReconciliationScope = ReconciliationScope & {
  writeBackPolicies?: ReadonlyMap<string, WriteBackPolicy>;
};

const sourceEvent: MaterializedSyncableEvent = {
  calendarId: SOURCE_CALENDAR_ID,
  calendarName: "Work",
  calendarUrl: null,
  description: "Bring the notes",
  endTime: END_TIME,
  eventStateId: "event-state-id-1",
  id: "event-state-id-1",
  location: "Room 4",
  sourceEventUid: "source-event-uid-1",
  startTime: START_TIME,
  summary: "Quarterly review",
};

const mapping: EventMapping = {
  calendarId: DESTINATION_CALENDAR_ID,
  deleteIdentifier: "destination-delete-id-1",
  destinationAvailability: "busy" as EventAvailability,
  destinationContentHash: createEditableEventContentHash(sourceEvent),
  destinationDescription: sourceEvent.description,
  destinationEndTime: sourceEvent.endTime,
  destinationIsAllDay: false,
  destinationLocation: sourceEvent.location,
  destinationStartTime: sourceEvent.startTime,
  destinationSummary: sourceEvent.summary,
  destinationEventUid: "destination-uid-1",
  endTime: sourceEvent.endTime,
  eventStateId: sourceEvent.eventStateId ?? sourceEvent.id,
  id: "mapping-id-1",
  sourceCalendarId: SOURCE_CALENDAR_ID,
  startTime: sourceEvent.startTime,
  syncEventHash: createSyncEventContentHash(sourceEvent),
  syncEventId: sourceEvent.id,
};

const policy: WriteBackPolicy = {
  deleteApproved: false,
  deleteApprovedAt: null,
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  excludeEventDescription: false,
  excludeEventLocation: false,
  excludeEventName: false,
  paused: false,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  writeBackMode: "edits_and_deletes",
};

const usersOwnEvent: RemoteEvent = {
  deleteId: "their-own-delete-id",
  endTime: END_TIME,
  isKeeperEvent: false,
  startTime: START_TIME,
  uid: "their-own-uid",
};

const classify = (remoteEvents: RemoteEvent[], remoteRawItemCount: number) => {
  const scope: TwoWayReconciliationScope = {
    authoritativeWindow: TEST_WINDOW,
    requestedWindow: TEST_WINDOW,
    writeBackPolicies: new Map([[SOURCE_CALENDAR_ID, policy]]),
  };
  return classifyInboundChanges({
    existingMappings: [mapping],
    localEvents: [sourceEvent],
    now: new Date("2027-05-01T00:00:00.000Z"),
    remoteEvents,
    remoteRawItemCount,
    scope,
  });
};

/*
 * Where the hold that stops the deletions and asks actually starts and stops, so the
 * sentences the product shows can be checked against it. A reading that returned nothing at
 * all cannot be told from a broken connection, so it holds. A reading that returned the
 * user's own events but none of the copies is a calendar Keeper.sh demonstrably read: the
 * disappearance is carried by the ordinary evidence instead — seen twice over minutes, the
 * copy searched for directly, and the bulk breaker above five.
 */
describe("the destination reading that raises the blank-read hold", () => {
  it("holds a reading that came back with nothing at all", () => {
    const blank = classify([], 0);

    expect(blank.readHealth).toBe("ambiguous_empty");
    expect(blank.deleteConfirmation?.reason).toBe("all_copies_missing");
  });

  it("does not hold a reading that carried other events but no copies", () => {
    const live = classify([usersOwnEvent], 1);

    expect(live.readHealth).toBe("live_empty");
    expect(live.deleteConfirmation).toBeNull();
  });
});
