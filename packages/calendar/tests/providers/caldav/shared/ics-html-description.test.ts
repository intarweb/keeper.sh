import { MAX_LINE_LENGTH } from "ts-ics";
import { describe, expect, it } from "vitest";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../../src/providers/caldav/shared/ics";
import {
  canonicalizeComparableText,
  containsMarkup,
} from "../../../../src/core/events/html-text";
import type { MaterializedSyncableEvent } from "../../../../src/core/types";

const MEET_ANCHOR = "<a href=\"https://tel.meet/xxx?pin=1&amp;hs=2\">"
  + "https://tel.meet/xxx?pin=1&amp;hs=2</a>";
const HTML_DESCRIPTION = String.raw`<p>Agenda; item one, item two \ three</p><p>Join ${MEET_ANCHOR}</p>`;

const TEAMS_URL = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=xyz";

const OUTLOOK_BODY = [
  "<html><head>",
  "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\">",
  "<style type=\"text/css\" style=\"display:none\">p {margin-top:0;margin-bottom:0}</style>",
  "</head>",
  "<body dir=\"ltr\"><div class=\"elementToProof\">Quarterly planning sync.</div>",
  "<div><a href=\"https://teams.microsoft.com/l/meetup-join/x?p=1&amp;q=2\">Join the meeting now</a></div>",
  "</body></html>",
].join("");

const OUTLOOK_WORD_BODY = "<html><head>"
  + "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\">"
  + "<style type=\"text/css\">p.MsoNormal {margin:0in; font-size:11.0pt}</style>"
  + "</head><body lang=\"EN-US\"><div class=\"WordSection1\">"
  + "<p class=\"MsoNormal\">Hi team &amp; friends<o:p></o:p></p>"
  + "<p class=\"MsoNormal\"><a href=\"https://teams.microsoft.com/l/x?a=1&amp;b=2\">Join</a></p>"
  + "</div></body></html>";

const NESTED = "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;"
  + "&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";

const createEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description: HTML_DESCRIPTION,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
  ...overrides,
});

const unfold = (ics: string): string => ics.replaceAll("\r\n ", "");

const getPropertyValue = (ics: string, name: string): string | undefined =>
  unfold(ics).split("\r\n").find((line) => line.startsWith(name))?.slice(name.length);

const describedBy = (overrides: Partial<MaterializedSyncableEvent>): string | undefined =>
  getPropertyValue(eventToICalString(createEvent(overrides), "uid-1@keeper.sh"), "DESCRIPTION:");

const roundTrip = (overrides: Partial<MaterializedSyncableEvent>): string | undefined =>
  parseICalToRemoteEvent(eventToICalString(createEvent(overrides), "uid-1@keeper.sh"))
    ?.description;

describe("eventToICalString with an HTML description", () => {
  it("writes DESCRIPTION as plain text", () => {
    const ics = eventToICalString(createEvent(), "uid-1@keeper.sh");

    expect(getPropertyValue(ics, "DESCRIPTION:")).toBe(
      String.raw`Agenda\; item one\, item two \\ three`
      + String.raw`\n\nJoin https://tel.meet/xxx?pin=1&hs=2`,
    );
  });

  it("stashes the original HTML under an escaped X-ALT-DESC inside VEVENT", () => {
    const ics = eventToICalString(createEvent(), "uid-1@keeper.sh");
    const body = ics.slice(ics.indexOf("BEGIN:VEVENT"), ics.indexOf("END:VEVENT"));

    expect(body).toContain("X-ALT-DESC;FMTTYPE=text/html:");
    expect(getPropertyValue(ics, "X-ALT-DESC;FMTTYPE=text/html:")).toBe(
      HTML_DESCRIPTION
        .replaceAll("\u005C", String.raw`\\`)
        .replaceAll(";", String.raw`\;`)
        .replaceAll(",", String.raw`\,`),
    );
  });

  it("folds every line exactly once, at the library's own limit", () => {
    const ics = eventToICalString(
      createEvent({ description: `<p>${"a".repeat(500)}</p>` }),
      "uid-1@keeper.sh",
    );

    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH + 1);
      expect(line.startsWith("  ")).toBe(false);
    }
  });

  it("leaves a plain-text description untouched and writes no X-ALT-DESC", () => {
    const plain = "s: https://tel.meet/x?pin=1&hs=2  Learn more";
    const ics = eventToICalString(createEvent({ description: plain }), "uid-1@keeper.sh");

    expect(ics).not.toContain("X-ALT-DESC");
    expect(getPropertyValue(ics, "DESCRIPTION:")).toBe(plain);
  });

  it("round-trips to the plain text and never back to the HTML", () => {
    const ics = eventToICalString(createEvent(), "uid-1@keeper.sh");

    const parsed = parseICalToRemoteEvent(ics);

    expect(parsed?.description).not.toContain("<p>");
    expect(parsed?.description).toBe(
      `Agenda; item one, item two ${"\u005C"} three\n\nJoin https://tel.meet/xxx?pin=1&hs=2`,
    );
  });

  it("keeps the write path comparable with the source HTML it was derived from", () => {
    const ics = eventToICalString(createEvent(), "uid-1@keeper.sh");
    const parsed = parseICalToRemoteEvent(ics);

    expect(canonicalizeComparableText(parsed?.description))
      .toBe(canonicalizeComparableText(HTML_DESCRIPTION));
  });
});

describe("DESCRIPTION written for an HTML body", () => {
  it("does not leak head, style or body markup into DESCRIPTION", () => {
    const description = describedBy({ description: OUTLOOK_WORD_BODY });

    expect(description).not.toContain("<html>");
    expect(description).not.toContain("<style");
    expect(description).not.toContain("MsoNormal");
    expect(description).not.toContain("</body>");
  });

  it("does not leak stylesheet source into the visible description", () => {
    expect(describedBy({ description: "<style>.x{color:red}</style><p>Agenda</p>" }))
      .not.toContain("color:red");
  });

  it("converts a description whose only markup is unlisted", () => {
    expect(describedBy({ description: "Photo: <img src=\"https://x.test/a.png\" alt=\"a\">" }))
      .not.toContain("<img");
  });

  it("keeps the join URL when the anchor text is a label", () => {
    expect(describedBy({
      description: `<p>Click here to join: <a href="${TEAMS_URL}">Join the meeting</a></p>`,
    })).toContain("teams.microsoft.com");
  });

  it("writes readable angle brackets, not entity source, into DESCRIPTION", () => {
    expect(describedBy({ description: "<p>Compare the &lt;div&gt; and &lt;span&gt; elements</p>" }))
      .toBe("Compare the <div> and <span> elements");
  });

  it("writes an unclosed element back exactly as the source wrote it", () => {
    const omitted = "<p>Agenda item one<p>Agenda item two";

    expect(containsMarkup(omitted)).toBe(false);
    expect(containsMarkup("<div>Agenda")).toBe(false);
    expect(describedBy({ description: omitted })).toBe(omitted);
  });

  it("does not delete text from the CalDAV DESCRIPTION", () => {
    const plain = "Bring the <source> document and the <link> handout";

    expect(describedBy({ description: plain })).toBe(plain);
  });
});

describe("what a CalDAV client reads back", () => {
  it("does not leak head/style markup into a CalDAV DESCRIPTION for an Outlook body", () => {
    const written = roundTrip({ description: OUTLOOK_BODY }) ?? "";

    expect(written).not.toContain("<style");
    expect(written).not.toContain("<html>");
    expect(written).not.toContain("margin-top:0");
    expect(written).toContain("Quarterly planning sync.");
  });

  it("does not delete angle-bracketed plain text on the CalDAV write path", () => {
    const plain = "Bring the <table> layout printout and the <b> form.";

    expect(roundTrip({ description: plain })).toBe(plain);
  });

  it("does not show HTML entity source in the plain-text DESCRIPTION", () => {
    expect(roundTrip({ description: "<p>Wrap it in &lt;b&gt;bold&lt;/b&gt; tags</p>" }))
      .toBe("Wrap it in <b>bold</b> tags");
  });

  it("does not double-escape an ampersand the source already escaped", () => {
    expect(roundTrip({ description: "<p>Use the &amp;amp; operator in XML</p>" }))
      .toBe("Use the &amp; operator in XML");
  });

  it("does not delete a placeholder token from what CalDAV clients render", () => {
    expect(roundTrip({
      description: "<p>Reply with <name> and <date>.<br>Thanks.</p>",
      startTimeZone: "UTC",
    })).toContain("<name>");
  });

  it("does not silently truncate the description written to CalDAV", () => {
    expect(roundTrip({ description: "Grade a<b or better</blockquote>", startTimeZone: "UTC" }))
      .toContain("or better");
  });

  it("writes readable plain text, not entity-escaped text", () => {
    expect(roundTrip({
      description: "<p>Meeting with AT&amp;T; bring the deck</p>",
      startTimeZone: "UTC",
    })).toBe("Meeting with AT&T; bring the deck");
  });

  it("does not re-escape angle brackets the source had already escaped", () => {
    expect(roundTrip({
      description: "<p>Use &lt;b&gt;bold&lt;/b&gt; markers</p>",
      startTimeZone: "UTC",
    })).toBe("Use <b>bold</b> markers");
  });

  it("keeps paragraphs apart in the CalDAV DESCRIPTION", () => {
    expect(roundTrip({ description: "<p>Agenda</p><p>Bring the deck</p>" }))
      .toBe("Agenda\n\nBring the deck");
  });

  it("does not leak literal markup into the CalDAV DESCRIPTION", () => {
    expect(roundTrip({
      description:
        "<p>Agenda</p><p>Join <a href=\"https://x.test/j>here</a> at noon</p><p>Bye</p>",
    })).not.toContain("<p>");
  });
});

describe("the mirror stays comparable with the description it was written from", () => {
  it("CalDAV write path stays comparable with its source for a 4-pass description", () => {
    expect(canonicalizeComparableText(roundTrip({ description: NESTED })))
      .toBe(canonicalizeComparableText(NESTED));
  });

  it("does not churn on an HTML description ending in an unclosed labelled anchor", () => {
    const description = "<p>Weekly sync</p>"
      + "<a href=\"https://zoom.us/j/123\">Join Zoom Meeting\n";

    expect(canonicalizeComparableText(roundTrip({ description })))
      .toBe(canonicalizeComparableText(description));
  });

  it("compares a mirror equal to the description it was written from", () => {
    const description = "&lt&ltb&gtd&lt/b&gt<style></style>\n<i>";

    expect(canonicalizeComparableText(roundTrip({ description })))
      .toBe(canonicalizeComparableText(description));
  });
});
