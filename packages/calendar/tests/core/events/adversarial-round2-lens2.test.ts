import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
import { canonicalizeComparableText } from "../../../src/core/events/html-text";
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

const roundTripThroughCalDAV = (description: string): string => {
  const event = createLocalEvent(description);
  return parseICalToRemoteEvent(eventToICalString(event, "uid-1@keeper.sh"))?.description ?? "";
};

describe("L2-A: provider escaping of an entity-shaped ampersand", () => {
  it("converges when Google escapes a literal &amp; the source description already contains", () => {
    const result = reconcile("Snacks &amp; drinks", "Snacks &amp;amp; drinks");

    expect(result.staleMappingIds).toEqual([]);
  });

  it("converges for the measured Meet block when the description also contains &nbsp;", () => {
    const local = "Bring &nbsp; snacks\n"
      + "s: https://tel.meet/abc-def-ghi?pin=123123123123123&hs=2";
    const echo = "Bring &amp;nbsp; snacks<br>"
      + "s: <a href=\"https://tel.meet/abc-def-ghi?pin=123123123123123&amp;hs=2\">"
      + "https://tel.meet/abc-def-ghi?pin=123123123123123&amp;hs=2</a>";

    expect(reconcile(local, echo).staleMappingIds).toEqual([]);
  });
});

describe("L2-B: CalDAV mirror this branch writes and reads back", () => {
  it("does not churn on an HTML description ending in an unclosed labelled anchor", () => {
    const description = "<p>Weekly sync</p>"
      + "<a href=\"https://zoom.us/j/123\">Join Zoom Meeting\n";

    expect(canonicalizeComparableText(roundTripThroughCalDAV(description)))
      .toBe(canonicalizeComparableText(description));
  });

  it("returns no stale mapping for the mirror it just wrote", () => {
    const description = "<div>Weekly sync</div>"
      + "<a href=\"https://teams.microsoft.com/l/meetup-join/19%3ax?context=y\">"
      + "Click here to join the meeting\n";

    expect(reconcile(description, roundTripThroughCalDAV(description)).staleMappingIds)
      .toEqual([]);
  });
});

describe("L2-D: what a CalDAV client actually renders", () => {
  it("does not show HTML entity source in the plain-text DESCRIPTION", () => {
    const ics = eventToICalString(
      createLocalEvent("<p>Wrap it in &lt;b&gt;bold&lt;/b&gt; tags</p>"),
      "uid-1@keeper.sh",
    );

    expect(parseICalToRemoteEvent(ics)?.description).toBe("Wrap it in <b>bold</b> tags");
  });

  it("does not double-escape an ampersand the source already escaped", () => {
    const ics = eventToICalString(
      createLocalEvent("<p>Use the &amp;amp; operator in XML</p>"),
      "uid-1@keeper.sh",
    );

    expect(parseICalToRemoteEvent(ics)?.description).toBe("Use the &amp; operator in XML");
  });
});

describe("L2-C: canonicalizeComparableText idempotence", () => {
  it("is idempotent for a non-breaking space following a tag-shaped token", () => {
    const once = canonicalizeComparableText("<a&nbsp; ");

    expect(canonicalizeComparableText(once)).toBe(once);
  });
});
