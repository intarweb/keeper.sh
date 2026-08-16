import { describe, expect, it } from "vitest";
import { classifyInboundChanges } from "../../../src/core/sync/write-back";
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
const PUSHED_START_TIME = new Date("2027-05-11T14:00:00.000Z");
const PUSHED_END_TIME = new Date("2027-05-11T15:00:00.000Z");
const MOVED_START_TIME = new Date("2027-05-11T16:00:00.000Z");
const MOVED_END_TIME = new Date("2027-05-11T17:00:00.000Z");
const SOURCE_MOVED_START_TIME = new Date("2027-05-11T18:00:00.000Z");
const SOURCE_MOVED_END_TIME = new Date("2027-05-11T19:00:00.000Z");
const NOW = new Date("2027-05-01T12:00:00.000Z");
const ONE_ITEM = 1;

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

/* The original as Keeper.sh last pushed it. */
const createPushedEvent = (): MaterializedSyncableEvent => ({
  availability: "busy",
  calendarId: SOURCE_CALENDAR_ID,
  calendarName: "Personal",
  calendarUrl: null,
  description: "Bring the notes",
  endTime: PUSHED_END_TIME,
  eventStateId: "event-state-id-1",
  id: "event-state-id-1",
  location: "Room 4",
  sourceEventUid: "source-event-uid-1",
  startTime: PUSHED_START_TIME,
  summary: "Quarterly review",
});

/* The original renamed on the source calendar, its times untouched. */
const createRenamedSourceEvent = (): MaterializedSyncableEvent => ({
  ...createPushedEvent(),
  summary: "Quarterly review — agenda attached",
});

/* The original rescheduled on the source calendar, its name untouched. */
const createRescheduledSourceEvent = (): MaterializedSyncableEvent => ({
  ...createPushedEvent(),
  endTime: SOURCE_MOVED_END_TIME,
  startTime: SOURCE_MOVED_START_TIME,
});

const createMapping = (pushed: MaterializedSyncableEvent): TwoWayEventMapping => ({
  calendarId: DESTINATION_CALENDAR_ID,
  deleteIdentifier: "destination-delete-id-1",
  destinationAvailability: "busy",
  destinationContentHash: createEditableEventContentHash(pushed),
  destinationDescription: normalizeText(pushed.description),
  destinationEndTime: pushed.endTime,
  destinationEventUid: "destination-uid-1",
  destinationIsAllDay: resolveIsAllDayEvent({
    endTime: pushed.endTime,
    startTime: pushed.startTime,
  }),
  destinationLocation: normalizeText(pushed.location),
  destinationStartTime: pushed.startTime,
  destinationSummary: normalizeText(pushed.summary),
  endTime: pushed.endTime,
  eventStateId: pushed.eventStateId ?? pushed.id,
  id: "mapping-id-1",
  sourceCalendarId: pushed.calendarId,
  startTime: pushed.startTime,
  syncEventHash: createSyncEventContentHash(pushed),
  syncEventId: pushed.id,
});

/* The copy, moved two hours later on the destination, its name untouched. */
const createMovedRemoteEvent = (
  mapping: TwoWayEventMapping,
  pushed: MaterializedSyncableEvent,
): RemoteEvent => ({
  deleteId: mapping.deleteIdentifier,
  editableAvailability: "busy",
  editableContentHash: createEditableEventContentHash(pushed),
  editableFields: {
    description: pushed.description ?? "",
    isAllDay: false,
    location: pushed.location ?? "",
    summary: pushed.summary,
  },
  endTime: MOVED_END_TIME,
  isKeeperEvent: true,
  startTime: MOVED_START_TIME,
  supportedAvailabilities: ["busy", "free"],
  uid: mapping.destinationEventUid,
});

/* The copy, moved on the destination, when the original moved too. */
const createBothMovedRemoteEvent = createMovedRemoteEvent;

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
  source: MaterializedSyncableEvent,
  build: (mapping: TwoWayEventMapping, pushed: MaterializedSyncableEvent) => RemoteEvent,
) => {
  const pushed = createPushedEvent();
  const mapping = createMapping(pushed);
  return classifyInboundChanges({
    existingMappings: [mapping],
    localEvents: [source],
    now: NOW,
    remoteEvents: [build(mapping, pushed)],
    remoteRawItemCount: ONE_ITEM,
    scope: createScope(),
  });
};

/*
 * The behaviour the docs page and the dashboard's conflict sentence have to describe. The
 * original wins on what the original changed, and only there: two edits that never meet are
 * both kept, and a source write does go out in that case. Copy that promises the copy's
 * edit is replaced whenever the original changed at all reads as "nothing is written to the
 * original", which is false for the first case below — so both cases are pinned here beside
 * the sentences that describe them.
 */
describe("both sides changed since the last push", () => {
  it("writes the copy's move back when the original only changed its name", () => {
    const result = classify(createRenamedSourceEvent(), createMovedRemoteEvent);

    const [classification] = result.classifications;
    expect(classification).toMatchObject({
      type: "write-back",
      updates: { endTime: MOVED_END_TIME, startTime: MOVED_START_TIME },
    });
  });

  it("lets the original win where both sides moved the same thing", () => {
    const result = classify(createRescheduledSourceEvent(), createBothMovedRemoteEvent);

    const [classification] = result.classifications;
    expect(classification).toMatchObject({ resolution: "source-wins", type: "conflict" });
  });
});
