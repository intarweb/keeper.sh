import { describe, expect, it } from "vitest";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import { classifyInboundChanges } from "../../../src/core/sync/write-back";
import { resolveWriteBackPolicyState } from "../../../src/core/sync/write-back-policy";
import type { WriteBackPolicy } from "../../../src/core/sync/write-back-policy";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
} from "../../../src/core/events/content-hash";
import type { EventMapping } from "../../../src/core/events/mappings";
import type {
  EventAvailability,
  MaterializedSyncableEvent,
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
  calendarName: "Personal",
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

const buildPolicy = (writeBackState: string): WriteBackPolicy => {
  const resolved = resolveWriteBackPolicyState("edits_and_deletes", writeBackState);
  return {
    deleteApproved: resolved.deleteApproved,
    deleteApprovedAt: resolved.deleteApprovedAt,
    destinationCalendarId: DESTINATION_CALENDAR_ID,
    excludeEventDescription: false,
    excludeEventLocation: false,
    excludeEventName: false,
    paused: resolved.paused,
    sourceCalendarId: SOURCE_CALENDAR_ID,
    writeBackMode: resolved.writeBackMode,
  };
};

/*
 * What getWriteBackPoliciesForDestination stamps on a pair whose source has not been read
 * inside the freshness window: the stored mode is kept and the pair is paused, because the
 * hold undoes itself the moment the source is read again.
 */
const buildStaleSourcePolicy = (): WriteBackPolicy => ({
  ...buildPolicy("ok"),
  deleteApproved: false,
  paused: true,
});

const runBlankReadWith = (policy: WriteBackPolicy) => {
  const scope: TwoWayReconciliationScope = {
    authoritativeWindow: TEST_WINDOW,
    requestedWindow: TEST_WINDOW,
    writeBackPolicies: new Map([[SOURCE_CALENDAR_ID, policy]]),
  };
  return classifyInboundChanges({
    existingMappings: [mapping],
    localEvents: [sourceEvent],
    now: new Date("2027-05-01T00:00:00.000Z"),
    remoteEvents: [],
    remoteRawItemCount: 0,
    scope,
  });
};

/*
 * The pair is already holding a question the user has not answered, and the reason it is
 * holding decides which answers the dashboard offers. A pause reached because the copies
 * were still there is answered by declining alone; the blank-read pause is the one that
 * offers to delete the originals. Re-stating the pause from a later reading overwrites the
 * first question with the second, so the user is handed a destructive answer to a question
 * that was never asked.
 */
describe("a blank read of a destination whose pair is already paused", () => {
  it("leaves the standing question alone", () => {
    const held = runBlankReadWith(buildPolicy("delete_confirmation_required"));

    expect(held.deleteConfirmation).toBeNull();
  });

  /*
   * The hold on a source that has not been read recently answers itself: nothing is written
   * back, nothing is rebuilt, and it lifts the moment the source is read. Turning it into a
   * stored delete question strands the pair on an answer only the user can give, about
   * copies read from a destination while the source was unreadable.
   */
  it("asks nothing of a pair held on a source it has not read", () => {
    const stale = runBlankReadWith(buildStaleSourcePolicy());

    expect(stale.deleteConfirmation).toBeNull();
  });

  it("still asks the question on a pair that is not paused", () => {
    const healthy = runBlankReadWith(buildPolicy("ok"));

    expect(healthy.deleteConfirmation?.reason).toBe("all_copies_missing");
  });
});
