import { describe, expect, it } from "vitest";
import {
  canonicalizeComparableText,
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
const descriptionOf = (ics: string): string =>
  unfold(ics).split("\r\n").find((line) => line.startsWith("DESCRIPTION:"))?.slice(12) ?? "";

const OUTLOOK_BODY = "<html><head>"
  + "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\">"
  + "<style type=\"text/css\">p.MsoNormal {margin:0in; font-size:11.0pt}</style>"
  + "</head><body lang=\"EN-US\"><div class=\"WordSection1\">"
  + "<p class=\"MsoNormal\">Hi team &amp; friends<o:p></o:p></p>"
  + "<p class=\"MsoNormal\"><a href=\"https://teams.microsoft.com/l/x?a=1&amp;b=2\">Join</a></p>"
  + "</div></body></html>";

describe("write path", () => {
  it("F1: does not leak head, style or body markup into DESCRIPTION", () => {
    const ics = eventToICalString(createLocalEvent(OUTLOOK_BODY), "uid-1@keeper.sh");
    const description = descriptionOf(ics);

    expect(description).not.toContain("<html>");
    expect(description).not.toContain("<style");
    expect(description).not.toContain("MsoNormal");
    expect(description).not.toContain("</body>");
  });

  it("F2: converts a description whose only markup is unlisted", () => {
    const ics = eventToICalString(
      createLocalEvent("Photo: <img src=\"https://x.test/a.png\" alt=\"a\">"),
      "uid-1@keeper.sh",
    );

    expect(descriptionOf(ics)).not.toContain("<img");
  });

  it("F3: keeps the destination of a labelled anchor reachable in plain text", () => {
    const plain = htmlToPlainText("<p>Join <a href=\"https://zoom.us/j/123\">Zoom Meeting</a></p>");

    expect(plain).toContain("https://zoom.us/j/123");
  });
});

describe("projection", () => {
  it("F4: does not split an unrecognized open tag at a quoted attribute's '>'", () => {
    expect(htmlToPlainText("<p>a <foo bar=\"x>y\">b</foo> c</p>")).toBe("a b c");
  });

  it("F5: converges when the provider escapes without introducing markup", () => {
    expect(canonicalizeComparableText("Tom &amp; Jerry"))
      .toBe(canonicalizeComparableText("Tom & Jerry"));
  });

  it("F6: reaches a fixed point on a deeply escaped value", () => {
    const value = "<b>&lt;b&gt;&amp;lt;b&amp;gt;&amp;amp;lt;b&amp;amp;gt;x</b>";
    const once = canonicalizeComparableText(value);

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("F7: keeps table cells separable", () => {
    expect(canonicalizeComparableText("<table><tr><td>a</td><td>b</td></tr></table>"))
      .not.toBe("ab");
  });

  it("F8: keeps a nested anchor's own destination", () => {
    expect(htmlToPlainText(
      "<a href=\"https://a.test\"><a href=\"https://b.test\">https://b.test</a></a>",
    )).toContain("b.test");
  });
});

describe("churn", () => {
  it("F9: does not churn when linkification adds a scheme to a bare domain", () => {
    const result = reconcile(
      "Join at meet.google.com/abc-defg-hij",
      "Join at <a href=\"https://meet.google.com/abc-defg-hij\">meet.google.com/abc-defg-hij</a>",
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("F10: does not churn when linkification adds a trailing slash", () => {
    const result = reconcile(
      "See https://support.google.com",
      "See <a href=\"https://support.google.com/\">https://support.google.com</a>",
    );

    expect(result.staleMappingIds).toEqual([]);
  });
});
