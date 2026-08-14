import { describe, expect, it } from "vitest";
import { canonicalizeComparableText, htmlToPlainText } from "../../../src/core/events/html-text";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../src/providers/caldav/shared/ics";
import type { MaterializedSyncableEvent } from "../../../src/core/types";

const FRAGMENTS = [
  "Agenda",
  "Snacks &amp; drinks",
  "Snacks & drinks",
  "&nbsp;",
  "&amp;amp;",
  "&lt;b&gt;bold&lt;/b&gt;",
  "<p>",
  "</p>",
  "<div>",
  "</div>",
  "<br>",
  "</br>",
  "<hr>",
  "<b>",
  "</b>",
  "<blockquote>",
  "</blockquote>",
  "<input>",
  "<source>",
  "<img src=\"https://x.test/a.png\">",
  "<name>",
  "<date>",
  "<table>",
  "<a href=\"https://tel.meet/abc-def?pin=1&amp;hs=2\">",
  "<a href=\"https://zoom.us/j/123\">",
  "</a>",
  "Click here to join the meeting",
  "https://tel.meet/abc-def?pin=1&hs=2",
  "<https://teams.microsoft.com/l/meetup-join/19%3ax?context=y>",
  "value < 3 and value > 1",
  "\n",
  "  ",
  "Q&A; then demo",
  "Note <!important> stuff",
  "<p>A</p>\n<p>B</p>",
  "&lt",
];

/*
 * A closed raw-text container is real markup and its contents are not prose,
 * and an unterminated attribute quote leaves a document no parser can finish
 * reading. Both are in the corpus the round trip has to survive, and neither
 * belongs in the corpus that promises to keep every word.
 */
const UNREADABLE_FRAGMENTS = [
  "&lt;style&gt;",
  "<style>",
  "</style>",
  "<title>",
  "<script>",
  "<head>",
  "</head>",
  "<a href=\"https://x.test/j>",
];

const nextSeed = (seed: number): number => (seed * 1_103_515_245 + 12_345) % 2_147_483_648;

const randomDescription = (fragments: string[], seed: number, remaining: number): string => {
  if (remaining === 0) {
    return "";
  }
  const advanced = nextSeed(seed);

  return fragments[advanced % fragments.length]
    + randomDescription(fragments, advanced, remaining - 1);
};

const createEvent = (description: string): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  startTimeZone: "UTC",
  summary: "Standup",
});

const roundTripThroughCalDAV = (description: string): string =>
  parseICalToRemoteEvent(eventToICalString(createEvent(description), "uid-1@keeper.sh"))
    ?.description ?? "";

const buildCorpus = (fragments: string[]): string[] =>
  Array.from({ length: 5_000 }).map((_unused, index) =>
    randomDescription(fragments, index + 1, (index % 8) + 1));

const DESCRIPTIONS = buildCorpus([...FRAGMENTS, ...UNREADABLE_FRAGMENTS]);
const READABLE_DESCRIPTIONS = buildCorpus(FRAGMENTS);

describe("description round trip", () => {
  it("compares a CalDAV mirror equal to the description it was written from", () => {
    const churning = DESCRIPTIONS.filter((description) =>
      canonicalizeComparableText(roundTripThroughCalDAV(description))
      !== canonicalizeComparableText(description));

    expect(churning).toEqual([]);
  });

  it("projects every description onto a fixed point", () => {
    const unstable = DESCRIPTIONS.filter((description) => {
      const once = canonicalizeComparableText(description);
      return canonicalizeComparableText(once) !== once;
    });

    expect(unstable).toEqual([]);
  });

  it("never deletes a word the description did not mark up", () => {
    const swallowed = READABLE_DESCRIPTIONS.filter((description) =>
      description.includes("<name>") && !htmlToPlainText(description).includes("<name>"));

    expect(swallowed).toEqual([]);
  });
});
