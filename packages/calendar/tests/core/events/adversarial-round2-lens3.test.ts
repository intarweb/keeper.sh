import { describe, expect, it } from "vitest";
import {
  canonicalizeComparableText,
  containsMarkup,
  htmlToPlainText,
} from "../../../src/core/events/html-text";
import { eventToICalString, parseICalToRemoteEvent } from "../../../src/providers/caldav/shared/ics";
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

const writeAndReadBack = (description: string): string | undefined => {
  const event = createLocalEvent(description);
  const ics = eventToICalString({ ...event, startTimeZone: "UTC" }, "uid-1");
  return parseICalToRemoteEvent(ics)?.description;
};

describe("L3R2-A: one void element makes every angle-bracketed plain word disappear", () => {
  it("keeps plain angle-bracketed words when the same description also contains a <br>", () => {
    expect(htmlToPlainText("Bring the <table> printout and a <br> pen"))
      .toBe("Bring the <table> printout and a\npen");
    expect(containsMarkup("Bring the <table> printout")).toBe(false);
  });

  it("does not delete a placeholder token from what CalDAV clients render", () => {
    const description = "<p>Reply with <name> and <date>.<br>Thanks.</p>";

    expect(writeAndReadBack(description)).toContain("<name>");
  });

  /*
   * Comparison reads every tag as structure so that a destination which closes
   * an omitted end tag still compares equal, which is what it costs: a
   * description edit that removes an angle-bracketed token and nothing else is
   * not compared. The token is still written, and a summary or a location —
   * where one token is a large share of the field — is compared exactly.
   */
  it("still sees a remote edit made beside such a token", () => {
    expect(reconcile("Wear a <hat> and bring an umbrella", "Wear a <hat> and bring a coat")
      .staleMappingIds).toEqual(["mapping-id-1"]);
    expect(reconcile("Room <B>, second floor", "Room , second floor").staleMappingIds)
      .toEqual([]);
  });
});

describe("L3R2-B: the closed-element check matches any longer tag name with the same prefix", () => {
  it("does not treat an unclosed <b as closed because </blockquote> appears later", () => {
    const plain = "Grade a<b or better";
    const withBlockquote = "Grade a<b or better</blockquote>";

    expect(containsMarkup(plain)).toBe(false);
    expect(containsMarkup(withBlockquote)).toBe(false);
    expect(htmlToPlainText(withBlockquote)).toContain("or better");
  });

  it("does not silently truncate the description written to CalDAV", () => {
    expect(writeAndReadBack("Grade a<b or better</blockquote>")).toContain("or better");
  });
});

describe("L3R2-C: the comparison projection is not escaping-invariant", () => {
  it("treats an escaped tag the same way it treats an escaped angle bracket", () => {
    expect(canonicalizeComparableText("&lt;")).toBe(canonicalizeComparableText("<"));
    expect(canonicalizeComparableText("Use &lt;b&gt;bold&lt;/b&gt; markers"))
      .toBe(canonicalizeComparableText("Use <b>bold</b> markers"));
  });

  it("converges when the destination echoes the description HTML-escaped", () => {
    const result = reconcile(
      "Use <b>bold</b> markers in the doc",
      "Use &lt;b&gt;bold&lt;/b&gt; markers in the doc",
    );

    expect(result.staleMappingIds).toEqual([]);
  });
});

describe("L3R2-D: the CalDAV write path emits HTML entities into DESCRIPTION", () => {
  it("writes readable plain text, not entity-escaped text", () => {
    expect(writeAndReadBack("<p>Meeting with AT&amp;T; bring the deck</p>"))
      .toBe("Meeting with AT&T; bring the deck");
  });

  it("does not re-escape angle brackets the source had already escaped", () => {
    expect(writeAndReadBack("<p>Use &lt;b&gt;bold&lt;/b&gt; markers</p>"))
      .toBe("Use <b>bold</b> markers");
  });
});
