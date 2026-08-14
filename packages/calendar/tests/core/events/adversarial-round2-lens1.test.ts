import { describe, expect, it } from "vitest";
import {
  canonicalizeComparableText,
  containsMarkup,
  htmlToPlainText,
} from "../../../src/core/events/html-text";
import { eventToICalString } from "../../../src/providers/caldav/shared/ics";
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

const unfold = (ics: string): string => ics.replaceAll("\r\n ", "");
const description = (ics: string): string =>
  unfold(ics).split("\r\n").find((line) => line.startsWith("DESCRIPTION:"))
    ?.slice("DESCRIPTION:".length) ?? "";

describe("R2L1-A: neutralizeMarkup re-escapes the plain text written to CalDAV", () => {
  it("writes readable angle brackets, not entity source, into DESCRIPTION", () => {
    const ics = eventToICalString(
      createLocalEvent("<p>Compare the &lt;div&gt; and &lt;span&gt; elements</p>"),
      "uid-1@keeper.sh",
    );

    expect(description(ics)).toBe("Compare the <div> and <span> elements");
  });

  it("does not double-escape an escaped ampersand into &amp;copy;", () => {
    expect(htmlToPlainText("<p>Escape the symbol as &amp;copy; in the doc</p>"))
      .toBe("Escape the symbol as &copy; in the doc");
  });

  it("keeps an anchor href usable when its query was entity-escaped", () => {
    expect(htmlToPlainText("<a href=\"https://x.test/s?q=&lt;b&gt;&amp;n=1\">Search</a>"))
      .toBe("Search (https://x.test/s?q=<b>&n=1)");
  });
});

describe("R2L1-B: HTML with omitted end tags", () => {
  const OMITTED = "<p>Agenda item one<p>Agenda item two";

  it("writes an unclosed element back exactly as the source wrote it", () => {
    expect(containsMarkup(OMITTED)).toBe(false);
    expect(containsMarkup("<div>Agenda")).toBe(false);
    expect(description(eventToICalString(createLocalEvent(OMITTED), "uid-1@keeper.sh")))
      .toBe(OMITTED);
  });

  it("converges when the destination closes the omitted end tags", () => {
    expect(reconcile(OMITTED, "<p>Agenda item one</p><p>Agenda item two</p>").staleMappingIds)
      .toEqual([]);
  });
});

describe("R2L1-C: plain text naming a void element is deleted", () => {
  it("keeps an angle-bracketed void element name in a plain description", () => {
    expect(htmlToPlainText("Set the <input> field before you arrive"))
      .toBe("Set the <input> field before you arrive");
  });

  it("does not delete text from the CalDAV DESCRIPTION", () => {
    const ics = eventToICalString(
      createLocalEvent("Bring the <source> document and the <link> handout"),
      "uid-1@keeper.sh",
    );

    expect(description(ics)).toBe("Bring the <source> document and the <link> handout");
  });
});

describe("R2L1-D: markup classification depends on unrelated text elsewhere", () => {
  it("does not change how <b> is read because </br> appears later", () => {
    expect(containsMarkup("Bring the <b> form")).toBe(false);
    expect(htmlToPlainText("Bring the <b> form")).toBe("Bring the <b> form");
    expect(htmlToPlainText("Bring the <b> form </br>")).toBe("Bring the <b> form");
  });
});

describe("R2L1-E: nested anchors emit a duplicated destination", () => {
  it("does not append the outer anchor's href to an already-labelled inner anchor", () => {
    expect(htmlToPlainText("<a href=\"https://a.test\"><a href=\"https://b.test\">Bee</a></a>"))
      .toBe("Bee (https://b.test)");
  });
});

describe("R2L1-F: comparison reads an escaped element the same way as an unescaped one", () => {
  it("resolves an escaped tag to the structure it escapes", () => {
    expect(canonicalizeComparableText("<p>Compare the &lt;div&gt; element</p>"))
      .toBe(canonicalizeComparableText("<p>Compare the <div> element</p>"));
    expect(canonicalizeComparableText("<p>Compare the &lt;div&gt; element</p>"))
      .toBe("Compare the\nelement");
  });
});

describe("R2L1-G: prose ampersand re-escaped in the written description", () => {
  it("does not re-escape an ampersand that precedes a word and a semicolon", () => {
    expect(htmlToPlainText("<p>Q&amp;A; then demo</p>")).toBe("Q&A; then demo");
    expect(htmlToPlainText("<div>R&amp;D; sync</div>")).toBe("R&D; sync");
  });
});
