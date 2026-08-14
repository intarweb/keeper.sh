import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../src/providers/caldav/shared/ics";
import type { EventMapping } from "../../../src/core/events/mappings";
import type { MaterializedSyncableEvent, RemoteEvent } from "../../../src/core/types";

const SCOPE: ReconciliationScope = {
  authoritativeWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
  requestedWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
};

const DESCRIPTION =
  "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";

const event: MaterializedSyncableEvent = {
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description: DESCRIPTION,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
};

const mapping: EventMapping = {
  calendarId: "destination-calendar-id",
  deleteIdentifier: "delete-identifier-1",
  destinationEventUid: "destination-uid-1",
  endTime: event.endTime,
  eventStateId: event.id,
  id: "mapping-id-1",
  sourceCalendarId: "source-calendar-id",
  startTime: event.startTime,
  syncEventHash: createSyncEventContentHash(event),
  syncEventId: event.id,
};

describe("CalDAV mirror written by this branch, read back by this branch", () => {
  it("does not churn forever", () => {
    const written = parseICalToRemoteEvent(
      eventToICalString(event, "uid-1@keeper.sh"),
    );
    const content = createEditableEventContentSnapshot({
      ...event,
      description: written?.description,
    });
    const remote: RemoteEvent = {
      deleteId: mapping.deleteIdentifier,
      editableAvailability: "busy",
      editableContent: content,
      editableContentHash: hashEditableEventContentSnapshot(content),
      endTime: event.endTime,
      isKeeperEvent: true,
      startTime: event.startTime,
      supportedAvailabilities: ["busy", "free"],
      uid: mapping.destinationEventUid,
    };

    const result = computeSyncOperations([event], [mapping], [remote], SCOPE);

    expect(result.staleMappingIds).toEqual([]);
    expect(result.operations).toEqual([]);
  });
});
