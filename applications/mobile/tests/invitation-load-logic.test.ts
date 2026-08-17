import { describe, expect, it } from "vitest";

import {
  invitationOccurrenceKey,
  removeInvitationOccurrence,
  summarizeInvitationResults,
} from "../src/features/events/invitation-load-logic";

describe("invitation partial failures", () => {
  it("keeps successful results while surfacing failed calendars", () => {
    expect(
      summarizeInvitationResults([
        { status: "fulfilled", value: ["first", "second"] },
        { status: "rejected", reason: new Error("offline") },
      ]),
    ).toEqual({ items: ["first", "second"], failed: 1 });
  });
});

describe("recurring invitation identity", () => {
  const first = {
    calendarId: "calendar",
    sourceEventUid: "weekly-series",
    startTime: "2026-08-14T16:00:00Z",
  };
  const second = { ...first, startTime: "2026-08-21T16:00:00Z" };

  it("includes occurrence start in list keys", () => {
    expect(invitationOccurrenceKey(first)).not.toBe(
      invitationOccurrenceKey(second),
    );
  });

  it("removes only the RSVP'd occurrence", () => {
    expect(removeInvitationOccurrence([first, second], first)).toEqual([
      second,
    ]);
  });
});
