import { describe, expect, it } from "vitest";

import {
  canMutateEvent,
  eventDateRangeLabel,
  eventDayLabel,
  eventDisplayTitle,
  eventTimeLabel,
} from "../src/features/events/event-display-logic";

describe("event display and mutation truth", () => {
  it("only permits mutation for direct user-created events", () => {
    expect(canMutateEvent({ eventStateId: null })).toBe(true);
    expect(canMutateEvent({ eventStateId: "source-event-state" })).toBe(false);
  });

  it("uses a privacy-safe fallback for empty titles", () => {
    expect(eventDisplayTitle({ title: "  " })).toBe("Busy");
    expect(eventDisplayTitle({ title: "Planning" })).toBe("Planning");
  });

  it("renders all-day dates from calendar dates without timezone shifting", () => {
    const event = {
      isAllDay: true,
      startTime: "2026-08-14T00:00:00.000Z",
      endTime: "2026-08-15T00:00:00.000Z",
    };
    expect(eventDayLabel(event, "en-US")).toBe("Friday, August 14");
    expect(eventTimeLabel(event, "en-US")).toBe("All Day");
    expect(eventDateRangeLabel(event, "en-US")).toBe(
      "Fri, Aug 14, 2026 · All Day",
    );
  });

  it("treats the all-day end date as exclusive for multi-day events", () => {
    expect(
      eventDateRangeLabel(
        { isAllDay: true, startTime: "2026-08-14", endTime: "2026-08-17" },
        "en-US",
      ),
    ).toBe("Fri, Aug 14, 2026 – Sun, Aug 16, 2026 · All Day");
  });
});
