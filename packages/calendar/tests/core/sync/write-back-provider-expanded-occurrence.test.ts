import { describe, expect, it } from "vitest";
import { classifyInboundChanges } from "../../../src/core/sync/write-back";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
  normalizeText,
} from "../../../src/core/events/content-hash";
import { resolveIsAllDayEvent } from "../../../src/core/events/all-day";
import { parseGoogleEventsWithDiagnostics } from "../../../src/providers/google/source/utils/fetch-events";
import type { GoogleCalendarEvent } from "../../../src/providers/google/source/types";
import type { EventMapping } from "../../../src/core/events/mappings";
import type {
  EventAvailability,
  MaterializedSyncableEvent,
} from "../../../src/core/types";

const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const SOURCE_CALENDAR_ID = "source-calendar-id";
const NOW = new Date("2027-05-01T12:00:00.000Z");
const MINUTE_MS = 60_000;
const GRACE_MS = 10 * MINUTE_MS;
const LONG_GONE = new Date(NOW.getTime() - GRACE_MS - MINUTE_MS);

const TEST_WINDOW = {
  timeMax: new Date("2100-01-01T00:00:00.000Z"),
  timeMin: new Date("2000-01-01T00:00:00.000Z"),
};

const SERIES_UID = "weekly-gym-master@google.com";

const googleOccurrence = (
  id: string,
  startTime: string,
  endTime: string,
): GoogleCalendarEvent => ({
  end: { dateTime: endTime, timeZone: "America/Denver" },
  iCalUID: SERIES_UID,
  id,
  recurringEventId: "weekly-gym-master",
  start: { dateTime: startTime, timeZone: "America/Denver" },
  status: "confirmed",
  summary: "Gym",
} as GoogleCalendarEvent);

const GOOGLE_OCCURRENCES: GoogleCalendarEvent[] = [
  googleOccurrence(
    "weekly-gym-master_20270511T140000Z",
    "2027-05-11T14:00:00.000Z",
    "2027-05-11T15:00:00.000Z",
  ),
  googleOccurrence(
    "weekly-gym-master_20270518T140000Z",
    "2027-05-18T14:00:00.000Z",
    "2027-05-18T15:00:00.000Z",
  ),
];

interface WriteBackPolicy {
  deleteApproved: boolean;
  deleteApprovedAt?: Date | null;
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
  missingFirstObservedAt: Date | null;
  missingObservationCount: number;
  recurrenceId: Date | null;
  recurrenceRule: string | null;
  writeBackEpoch: number;
  writeBackEpochWindowStart: Date | null;
};

type TwoWayReconciliationScope = ReconciliationScope & {
  writeBackPolicies: ReadonlyMap<string, WriteBackPolicy>;
};

/*
 * The row the Google source ingest writes for one occurrence, read back as the destination
 * pass reads it: one event_states row per occurrence, its own sourceEventId, the series'
 * shared uid, and whatever the parse preserved of the fact that it repeats.
 */
const toStoredOccurrence = (
  slot: ReturnType<typeof parseGoogleEventsWithDiagnostics>["events"][number],
): MaterializedSyncableEvent => {
  const stateId = `state-${slot.sourceEventId}`;
  const recurrenceId = (slot as { recurrenceId?: Date }).recurrenceId ?? null;
  return {
    availability: "busy",
    calendarId: SOURCE_CALENDAR_ID,
    calendarName: "Personal",
    calendarUrl: null,
    description: "",
    endTime: slot.endTime,
    eventStateId: stateId,
    id: stateId,
    location: "",
    sourceEventUid: slot.uid,
    sourceFields: { description: null, location: null, title: slot.title ?? null },
    startTime: slot.startTime,
    summary: slot.title ?? "",
    ...(recurrenceId && { recurrenceId }),
  } as MaterializedSyncableEvent;
};

const createMapping = (
  event: MaterializedSyncableEvent,
): TwoWayEventMapping => ({
  calendarId: DESTINATION_CALENDAR_ID,
  deleteIdentifier: `destination-delete-id-${event.id}`,
  destinationAvailability: "busy",
  destinationContentHash: createEditableEventContentHash(event),
  destinationDescription: normalizeText(event.description),
  destinationEndTime: event.endTime,
  destinationEventUid: `destination-uid-${event.id}`,
  destinationIsAllDay: resolveIsAllDayEvent({
    endTime: event.endTime,
    startTime: event.startTime,
  }),
  destinationLocation: normalizeText(event.location),
  destinationStartTime: event.startTime,
  destinationSummary: normalizeText(event.summary),
  endTime: event.endTime,
  eventStateId: event.eventStateId ?? event.id,
  id: `mapping-${event.id}`,
  missingFirstObservedAt: LONG_GONE,
  missingObservationCount: 2,
  recurrenceId: (event as { recurrenceId?: Date }).recurrenceId ?? null,
  recurrenceRule: null,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  startTime: event.startTime,
  syncEventHash: createSyncEventContentHash(event),
  syncEventId: event.id,
  writeBackEpoch: 0,
  writeBackEpochWindowStart: null,
});

const scope: TwoWayReconciliationScope = {
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
    writeBackMode: "edits_and_deletes" as const,
  }]]),
};

describe("an occurrence of a Google series survives the source parse as a repeating event", () => {
  it("marks the occurrences of a series so the rest of the pipeline can tell", () => {
    const parsed = parseGoogleEventsWithDiagnostics(GOOGLE_OCCURRENCES);

    expect(parsed.events).toHaveLength(2);
    for (const slot of parsed.events) {
      expect(slot).toHaveProperty("recurrenceId");
    }
  });
});

describe("write-back refuses a copy of a Google series occurrence", () => {
  it("refuses to delete the original occurrence when its copy goes missing", () => {
    const parsed = parseGoogleEventsWithDiagnostics(GOOGLE_OCCURRENCES);
    const events = parsed.events.map((slot) => toStoredOccurrence(slot));
    const mappings = events.map((event) => createMapping(event));

    const result = classifyInboundChanges({
      existingMappings: mappings,
      localEvents: events,
      now: NOW,
      remoteEvents: [],
      remoteRawItemCount: 12,
      scope,
    });

    expect(result.readHealth).toBe("live_empty");
    expect(result.classifications.map((classification) => classification.type))
      .not.toContain("delete");
    expect(result.classifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "recurring_event", type: "rejected" }),
      ]),
    );
  });
});
