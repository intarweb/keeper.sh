import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
import {
  canonicalizeComparableText,
  htmlToPlainText,
} from "../../../src/core/events/html-text";
import { eventToICalString, parseICalToRemoteEvent } from "../../../src/providers/caldav/shared/ics";
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

const readDescription = (ics: string): string =>
  parseICalToRemoteEvent(ics)?.description ?? "";

describe("R3L1-A: an empty paragraph is worth zero newlines", () => {
  it("keeps a blank line visible to comparison when the destination deletes it", () => {
    expect(reconcile(
      "<div>Agenda</div><div><br></div><div>Bring the deck</div>",
      "<div>Agenda</div><div>Bring the deck</div>",
    ).staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("converges when the destination returns a blank line as an empty block", () => {
    expect(reconcile(
      "Agenda\n\nBring the deck",
      "<div>Agenda</div><div><br></div><div>Bring the deck</div>",
    ).staleMappingIds).toEqual([]);
  });

  it("counts empty paragraphs consistently", () => {
    const one = canonicalizeComparableText("<div>a</div><div><br></div><div>b</div>");
    const two = canonicalizeComparableText(
      "<div>a</div><div><br></div><div><br></div><div>b</div>",
    );
    expect([one, two]).toEqual(["a\n\nb", "a\n\n\nb"]);
  });

  it("keeps paragraphs apart in the CalDAV DESCRIPTION", () => {
    const ics = eventToICalString(
      createLocalEvent("<p>Agenda</p><p>Bring the deck</p>"),
      "uid-1",
    );
    expect(readDescription(ics)).toBe("Agenda\n\nBring the deck");
  });
});

describe("R3L1-B: an unterminated attribute quote truncates the description", () => {
  const MALFORMED =
    "<p>Agenda</p><p>Join <a href=\"https://x.test/j>here</a> at noon</p><p>Bye</p>";

  it("does not delete the rest of the description", () => {
    expect(htmlToPlainText(MALFORMED)).toContain("Bye");
  });

  it("does not leak literal markup into the CalDAV DESCRIPTION", () => {
    const ics = eventToICalString(createLocalEvent(MALFORMED), "uid-1");
    expect(readDescription(ics)).not.toContain("<p>");
  });

  it("does not delete text that follows a malformed anchor", () => {
    expect(htmlToPlainText("<p>Reply \"yes\"</p><a href=\"https://x.test/j>x</a><p>Bye</p>"))
      .toContain("Bye");
  });
});

describe("R3L1-C: comparison deletes text the write path keeps", () => {
  it("keeps an angle-bracketed note visible to comparison", () => {
    expect(reconcile("Note <!important> stuff", "Note stuff").staleMappingIds)
      .toEqual(["mapping-id-1"]);
  });

  it("writes the note but compares as if it were absent", () => {
    expect(htmlToPlainText("Note <!important> stuff")).toBe("Note <!important> stuff");
    expect(canonicalizeComparableText("Note <!important> stuff")).toBe("Note <!important> stuff");
  });
});

describe("R3L1-D: an href that is a substring of its label is discarded", () => {
  it("keeps a relative destination reachable", () => {
    expect(htmlToPlainText("<a href=\"/agenda\">See the /agenda page</a>"))
      .toBe("See the /agenda page (/agenda)");
  });

  it("keeps a short destination reachable", () => {
    expect(htmlToPlainText("<a href=\"https://x.test\">Mirror of https://x.test/deck.pdf</a>"))
      .toContain("deck.pdf (https://x.test)");
  });
});
