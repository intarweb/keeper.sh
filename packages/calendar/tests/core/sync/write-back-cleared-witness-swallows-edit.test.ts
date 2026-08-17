import { describe, expect, it } from "vitest";
import { classifyInboundChanges } from "../../../src/core/sync/write-back";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
  normalizeText,
} from "../../../src/core/events/content-hash";
import { resolveIsAllDayEvent } from "../../../src/core/events/all-day";
import type { EventMapping } from "../../../src/core/events/mappings";
import type {
  EventAvailability,
  MaterializedSyncableEvent,
  RemoteEvent,
} from "../../../src/core/types";

const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const SOURCE_CALENDAR_ID = "source-calendar-id";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const NOW = new Date("2027-05-01T12:00:00.000Z");
const ONE_ITEM = 1;
const NO_REPAIRS = 0;

const TEST_WINDOW = {
  timeMax: new Date("2100-01-01T00:00:00.000Z"),
  timeMin: new Date("2000-01-01T00:00:00.000Z"),
};

interface WriteBackPolicy {
  deleteApproved: boolean;
  destinationCalendarId: string;
  excludeEventDescription: boolean;
  excludeEventLocation: boolean;
  excludeEventName: boolean;
  paused: boolean;
  sourceCalendarId: string;
  writeBackMode: "edits" | "edits_and_deletes" | "off";
}

type TwoWayEventMapping = EventMapping & {
  destinationAvailability: EventAvailability | null;
  destinationContentHash: string | null;
  destinationDescription: string | null;
  destinationEndTime: Date | null;
  destinationIsAllDay: boolean | null;
  destinationLocation: string | null;
  destinationStartTime: Date | null;
  destinationSummary: string | null;
};

type TwoWayReconciliationScope = ReconciliationScope & {
  writeBackPolicies?: ReadonlyMap<string, WriteBackPolicy>;
};

const createLocalEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  availability: "busy",
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
  ...overrides,
});

/*
 * A copy Keeper.sh has read at least once: the witness columns hold what it saw, which is
 * what an edit on the copy is later recognised against.
 */
const createObservedMapping = (
  event: MaterializedSyncableEvent,
): TwoWayEventMapping => ({
  calendarId: DESTINATION_CALENDAR_ID,
  deleteIdentifier: "destination-delete-id-1",
  destinationAvailability: "busy",
  destinationContentHash: createEditableEventContentHash(event),
  destinationDescription: normalizeText(event.description),
  destinationEndTime: event.endTime,
  destinationEventUid: "destination-uid-1",
  destinationIsAllDay: false,
  destinationLocation: normalizeText(event.location),
  destinationStartTime: event.startTime,
  destinationSummary: normalizeText(event.summary),
  endTime: event.endTime,
  eventStateId: event.eventStateId ?? event.id,
  id: "mapping-id-1",
  sourceCalendarId: event.calendarId,
  startTime: event.startTime,
  syncEventHash: createSyncEventContentHash(event),
  syncEventId: event.id,
});

/*
 * The same mapping after clearDestinationWitness has run over the whole connection. Nothing
 * about this copy changed: it is still on the destination and it still carries the user's
 * edit.
 */
const withWitnessCleared = (mapping: TwoWayEventMapping): TwoWayEventMapping => ({
  ...mapping,
  destinationAvailability: null,
  destinationContentHash: null,
  destinationDescription: null,
  destinationEndTime: null,
  destinationIsAllDay: null,
  destinationLocation: null,
  destinationStartTime: null,
  destinationSummary: null,
});

const createRemoteEvent = (
  mapping: TwoWayEventMapping,
  shownOnTheCopy: MaterializedSyncableEvent,
): RemoteEvent => ({
  deleteId: mapping.deleteIdentifier,
  editableAvailability: "busy",
  editableContentHash: createEditableEventContentHash(shownOnTheCopy),
  editableFields: {
    description: shownOnTheCopy.description ?? "",
    isAllDay: resolveIsAllDayEvent({
      endTime: shownOnTheCopy.endTime,
      startTime: shownOnTheCopy.startTime,
    }),
    location: shownOnTheCopy.location ?? "",
    summary: shownOnTheCopy.summary,
  },
  endTime: shownOnTheCopy.endTime,
  isKeeperEvent: true,
  startTime: shownOnTheCopy.startTime,
  supportedAvailabilities: ["busy", "free"],
  uid: mapping.destinationEventUid,
});

const createScope = (): TwoWayReconciliationScope => ({
  authoritativeWindow: TEST_WINDOW,
  requestedWindow: TEST_WINDOW,
  writeBackPolicies: new Map([[SOURCE_CALENDAR_ID, {
    deleteApproved: false,
    destinationCalendarId: DESTINATION_CALENDAR_ID,
    excludeEventDescription: false,
    excludeEventLocation: false,
    excludeEventName: false,
    paused: false,
    sourceCalendarId: SOURCE_CALENDAR_ID,
    writeBackMode: "edits",
  }]]),
});

const classify = (
  mapping: TwoWayEventMapping,
  event: MaterializedSyncableEvent,
  remoteEvent: RemoteEvent,
): ReturnType<typeof classifyInboundChanges> =>
  classifyInboundChanges({
    existingMappings: [mapping],
    localEvents: [event],
    now: NOW,
    remoteEvents: [remoteEvent],
    remoteRawItemCount: ONE_ITEM,
    scope: createScope(),
  });

/*
 * The witness is what tells an edit the user made on a copy apart from the copy Keeper.sh
 * itself pushed. Clearing it on a mapping whose copy is still there and still holds a
 * standing edit does not put the copy back and does not write the edit to the original:
 * the classifier reads the copy as never observed and adopts it as the new baseline, so the
 * edit is swallowed and the destination stays permanently ahead of the source with nothing
 * anywhere left to notice. Adopting is still the only safe answer once the witness is gone,
 * because the write the alternative asks for lands on the user's real source event on a
 * guess — so the cost is pinned here and paid at the other end, by never clearing a witness
 * that belongs to a copy the delete question was not about.
 */
describe("a copy carrying a standing edit whose witness is cleared underneath it", () => {
  it("is written back while the witness stands", () => {
    const event = createLocalEvent();
    const mapping = createObservedMapping(event);
    const editedOnTheCopy = createLocalEvent({ summary: "Moved by the user on the copy" });
    const remoteEvent = createRemoteEvent(mapping, editedOnTheCopy);

    const result = classify(mapping, event, remoteEvent);

    expect(result.classifications.map(({ type }) => type)).toContain("write-back");
  });

  /*
   * The classifier cannot write this back and must not try. With no witness it has no
   * record of what Keeper.sh pushed, so the copy in front of it is equally a user edit and
   * a provider re-encoding of our own write — and the write it is being asked to make lands
   * on the user's real source event, which no later pass can undo. Adopting is the only
   * answer that destroys nothing, which is precisely why the witness must never be cleared
   * on a copy the question was not about.
   */
  it("is adopted rather than guessed at once the witness has been cleared", () => {
    const event = createLocalEvent();
    const mapping = withWitnessCleared(createObservedMapping(event));
    const editedOnTheCopy = createLocalEvent({ summary: "Moved by the user on the copy" });
    const remoteEvent = createRemoteEvent(mapping, editedOnTheCopy);

    const result = classify(mapping, event, remoteEvent);

    expect(result.classifications.map(({ type }) => type)).toStrictEqual(["adopt-baseline"]);
  });

  it("is not put back on the copy either once the witness has been cleared", () => {
    const event = createLocalEvent();
    const mapping = withWitnessCleared(createObservedMapping(event));
    const editedOnTheCopy = createLocalEvent({ summary: "Moved by the user on the copy" });
    const remoteEvent = createRemoteEvent(mapping, editedOnTheCopy);
    const scope = createScope();

    const result = classify(mapping, event, remoteEvent);
    const { operations } = computeSyncOperations(
      [event],
      [mapping],
      [remoteEvent],
      scope,
      new Set(result.suppressedMappingIds),
    );

    expect(operations.filter(({ type }) => type === "replace")).toHaveLength(NO_REPAIRS);
  });
});
