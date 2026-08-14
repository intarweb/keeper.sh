import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
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

const createLocalEvent = (description: string): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
});

const createMapping = (event: MaterializedSyncableEvent): EventMapping => ({
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
});

const createRemoteEvent = (
  event: MaterializedSyncableEvent,
  mapping: EventMapping,
  remoteDescription: string,
): RemoteEvent => {
  const content = createEditableEventContentSnapshot({ ...event, description: remoteDescription });
  return {
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
};

const reconcile = (localDescription: string, remoteDescription: string) => {
  const event = createLocalEvent(localDescription);
  const mapping = createMapping(event);
  return computeSyncOperations(
    [event],
    [mapping],
    [createRemoteEvent(event, mapping, remoteDescription)],
    SCOPE,
  );
};

describe("adversarial: linkification that adds a scheme", () => {
  it("converges when the provider linkifies a bare www URL by adding a scheme", () => {
    const result = reconcile(
      "Report: www.example.com/report?a=1&b=2",
      "Report: <a href=\"http://www.example.com/report?a=1&amp;b=2\">"
      + "www.example.com/report?a=1&amp;b=2</a>",
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("converges when the provider linkifies a bare domain and adds a trailing slash", () => {
    const result = reconcile(
      "Docs at support.google.com",
      "Docs at <a href=\"https://support.google.com/\">support.google.com</a>",
    );

    expect(result.staleMappingIds).toEqual([]);
  });
});

describe("adversarial: remote drift that must still be corrected", () => {
  it("replaces the mirror when a labelled link is repointed remotely", () => {
    const result = reconcile(
      "<p>Join <a href=\"https://zoom.us/j/111?pwd=real\">Zoom Meeting</a></p>",
      "<p>Join <a href=\"https://evil.example/j/999\">Zoom Meeting</a></p>",
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("replaces the mirror when the link is stripped from the mirror entirely", () => {
    const result = reconcile(
      "<p>Join <a href=\"https://zoom.us/j/111?pwd=real\">Zoom Meeting</a></p>",
      "<p>Join Zoom Meeting</p>",
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });
});
