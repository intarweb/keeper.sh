import { describe, expect, it } from "vitest";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../src/providers/caldav/shared/ics";
import { canonicalizeComparableText } from "../../../src/core/events/html-text";
import type { MaterializedSyncableEvent } from "../../../src/core/types";

const OUTLOOK_BODY = [
  "<html><head>",
  "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\">",
  "<style type=\"text/css\" style=\"display:none\">p {margin-top:0;margin-bottom:0}</style>",
  "</head>",
  "<body dir=\"ltr\"><div class=\"elementToProof\">Quarterly planning sync.</div>",
  "<div><a href=\"https://teams.microsoft.com/l/meetup-join/x?p=1&amp;q=2\">Join the meeting now</a></div>",
  "</body></html>",
].join("");

const createEvent = (description: string): MaterializedSyncableEvent => ({
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

const roundTrip = (description: string): string | undefined =>
  parseICalToRemoteEvent(eventToICalString(createEvent(description), "uid-1@keeper.sh"))
    ?.description;

describe("blast radius", () => {
  it("T1: does not leak head/style markup into a CalDAV DESCRIPTION for an Outlook body", () => {
    const written = roundTrip(OUTLOOK_BODY) ?? "";

    expect(written).not.toContain("<style");
    expect(written).not.toContain("<html>");
    expect(written).not.toContain("margin-top:0");
    expect(written).toContain("Quarterly planning sync.");
  });

  it("T2: does not delete angle-bracketed plain text on the CalDAV write path", () => {
    const plain = "Bring the <table> layout printout and the <b> form.";

    expect(roundTrip(plain)).toBe(plain);
  });

  it("T3: canonicalizeComparableText is idempotent", () => {
    const value =
      "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";
    const once = canonicalizeComparableText(value);

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("T4: CalDAV write path stays comparable with its source for a 4-pass description", () => {
    const value =
      "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";

    expect(canonicalizeComparableText(roundTrip(value)))
      .toBe(canonicalizeComparableText(value));
  });
});
