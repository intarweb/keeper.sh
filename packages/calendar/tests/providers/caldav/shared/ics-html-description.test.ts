import { MAX_LINE_LENGTH } from "ts-ics";
import { describe, expect, it } from "vitest";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../../src/providers/caldav/shared/ics";
import { canonicalizeComparableText } from "../../../../src/core/events/html-text";
import type { MaterializedSyncableEvent } from "../../../../src/core/types";

const MEET_ANCHOR = "<a href=\"https://tel.meet/xxx?pin=1&amp;hs=2\">"
  + "https://tel.meet/xxx?pin=1&amp;hs=2</a>";
const HTML_DESCRIPTION = String.raw`<p>Agenda; item one, item two \ three</p><p>Join ${MEET_ANCHOR}</p>`;

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
