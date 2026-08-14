import { describe, expect, it } from "vitest";
import { eventToICalString } from "../../../../src/providers/caldav/shared/ics";
import type { MaterializedSyncableEvent } from "../../../../src/core/types";

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

const unfold = (ics: string): string => ics.replaceAll("\r\n ", "");

const getPropertyValue = (ics: string, name: string): string | undefined =>
  unfold(ics).split("\r\n").find((line) => line.startsWith(name))?.slice(name.length);

const TEAMS_URL = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=xyz";

describe("eventToICalString adversarial", () => {
  it("keeps the join URL when the anchor text is a label", () => {
    const ics = eventToICalString(
      createEvent(`<p>Click here to join: <a href="${TEAMS_URL}">Join the meeting</a></p>`),
      "uid-1@keeper.sh",
    );

    expect(getPropertyValue(ics, "DESCRIPTION:")).toContain("teams.microsoft.com");
  });

  it("does not leak stylesheet source into the visible description", () => {
    const ics = eventToICalString(
      createEvent("<style>.x{color:red}</style><p>Agenda</p>"),
      "uid-1@keeper.sh",
    );

    expect(getPropertyValue(ics, "DESCRIPTION:")).not.toContain("color:red");
  });
});
