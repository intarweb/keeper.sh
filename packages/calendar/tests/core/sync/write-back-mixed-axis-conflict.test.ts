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
  SyncOperation,
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

/* The copy, moved two hours later AND given a new location, on the destination. */
const createMovedAndRelocatedRemoteEvent = (
  mapping: TwoWayEventMapping,
  pushed: MaterializedSyncableEvent,
): RemoteEvent => ({
  deleteId: mapping.deleteIdentifier,
  editableAvailability: "busy",
  editableContentHash: createEditableEventContentHash({
    ...pushed,
    endTime: MOVED_END_TIME,
    location: "Room 9",
    startTime: MOVED_START_TIME,
  }),
  editableFields: {
    description: pushed.description ?? "",
    isAllDay: false,
    location: "Room 9",
    summary: pushed.summary,
  },
  endTime: MOVED_END_TIME,
  isKeeperEvent: true,
  startTime: MOVED_START_TIME,
  supportedAvailabilities: ["busy", "free"],
  uid: mapping.destinationEventUid,
});

/* The copy, moved AND renamed on the destination. */
const createMovedAndRenamedRemoteEvent = (
  mapping: TwoWayEventMapping,
  pushed: MaterializedSyncableEvent,
): RemoteEvent => ({
  deleteId: mapping.deleteIdentifier,
  editableAvailability: "busy",
  editableContentHash: createEditableEventContentHash({
    ...pushed,
    endTime: MOVED_END_TIME,
    startTime: MOVED_START_TIME,
    summary: "Quarterly review (my copy)",
  }),
  editableFields: {
    description: pushed.description ?? "",
    isAllDay: false,
    location: pushed.location ?? "",
    summary: "Quarterly review (my copy)",
  },
  endTime: MOVED_END_TIME,
  isKeeperEvent: true,
  startTime: MOVED_START_TIME,
  supportedAvailabilities: ["busy", "free"],
  uid: mapping.destinationEventUid,
});

/* The copy, renamed only, on the destination. Its times are where Keeper.sh left them. */
const createRenamedRemoteEvent = (
  mapping: TwoWayEventMapping,
  pushed: MaterializedSyncableEvent,
): RemoteEvent => ({
  deleteId: mapping.deleteIdentifier,
  editableAvailability: "busy",
  editableContentHash: createEditableEventContentHash({
    ...pushed,
    summary: "Quarterly review (my copy)",
  }),
  editableFields: {
    description: pushed.description ?? "",
    isAllDay: false,
    location: pushed.location ?? "",
    summary: "Quarterly review (my copy)",
  },
  endTime: PUSHED_END_TIME,
  isKeeperEvent: true,
  startTime: PUSHED_START_TIME,
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
 * The dashboard tells the user, verbatim: "An edit to something the original did not change
 * is still written back." The classifier resolves the argument per axis, but the verdict is
 * a single flag: one axis conflicting discards the payload the other axis had already
 * earned.
 */
describe("a copy edited on two axes when the original moved on one", () => {
  it("still writes back the move the original did not touch", () => {
    const result = classify(
      createRenamedSourceEvent(),
      createMovedAndRelocatedRemoteEvent,
    );

    const [classification] = result.classifications;
    expect(classification).toMatchObject({
      type: "write-back",
      updates: { endTime: MOVED_END_TIME, startTime: MOVED_START_TIME },
    });
  });

  it("still writes back the rename the original did not touch", () => {
    const result = classify(createRescheduledSourceEvent(), createMovedAndRenamedRemoteEvent);

    const [classification] = result.classifications;
    expect(classification).toMatchObject({
      type: "write-back",
      updates: { summary: "Quarterly review (my copy)" },
    });
  });

  /*
   * The control. One axis edited on the copy, the other axis edited on the original, and
   * the write-back does go out — which is what the promised sentence was written from, and
   * what makes the two cases above a defect rather than the documented conflict rule.
   */
  it("writes the rename back when the copy was only renamed", () => {
    const result = classify(createRescheduledSourceEvent(), createRenamedRemoteEvent);

    const [classification] = result.classifications;
    expect(classification).toMatchObject({
      type: "write-back",
      updates: { summary: "Quarterly review (my copy)" },
    });
  });
});

/*
 * The other half of keeping the payload: the axis that did lose the argument must still be
 * put back on the copy, or splitting the verdict would trade a swallowed edit for a copy
 * left stably wrong. Nothing repairs it in the pass that writes back, because the mapping
 * is suppressed while a write-back is in flight against it, so the push hash the pass
 * records is the whole of what schedules the rebuild. These drive the real classifier and
 * then hand the hash it recorded to the real operation planner on the pass after.
 */
const nextPassOperations = (
  source: MaterializedSyncableEvent,
  build: (mapping: TwoWayEventMapping, pushed: MaterializedSyncableEvent) => RemoteEvent,
): SyncOperation[] => {
  const pushed = createPushedEvent();
  const mapping = createMapping(pushed);
  const remoteEvent = build(mapping, pushed);
  const [classification] = classifyInboundChanges({
    existingMappings: [mapping],
    localEvents: [source],
    now: NOW,
    remoteEvents: [remoteEvent],
    remoteRawItemCount: ONE_ITEM,
    scope: createScope(),
  }).classifications;

  if (!classification || classification.type !== "write-back") {
    throw new Error("The pass under test wrote nothing back");
  }

  /*
   * The source now carries the write-back and the mapping carries the hash the pass
   * recorded against it. Everything else about the pair is left exactly as it was.
   */
  const settledSource = { ...source, ...classification.updates };
  const settledMapping = {
    ...mapping,
    ...("startTime" in classification.updates && {
      endTime: classification.updates.endTime ?? mapping.endTime,
      startTime: classification.updates.startTime ?? mapping.startTime,
    }),
    syncEventHash: classification.projectedSyncEventHash,
  };

  return computeSyncOperations(
    [settledSource],
    [settledMapping],
    [remoteEvent],
    createScope(),
    new Set<string>(),
  ).operations;
};

describe("the axis that lost the argument", () => {
  it("is rebuilt on the copy after the move is written back", () => {
    const operations = nextPassOperations(
      createRenamedSourceEvent(),
      createMovedAndRelocatedRemoteEvent,
    );

    expect(operations.map(({ type }) => type)).toContain("replace");
  });

  it("is rebuilt on the copy after the rename is written back", () => {
    const operations = nextPassOperations(
      createRescheduledSourceEvent(),
      createMovedAndRenamedRemoteEvent,
    );

    expect(operations.map(({ type }) => type)).toContain("replace");
  });
});
