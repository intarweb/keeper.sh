import { describe, expect, it } from "vitest";

import {
  buildEventDatePayload,
  combineLocalDateAndTime,
  normalizeAllDayRange,
  parseAllDayDate,
  validateEventDateRange,
} from "../src/features/events/event-date-logic";

describe("event date behavior", () => {
  it("combines local picker values without losing the chosen day or time", () => {
    const result = combineLocalDateAndTime(
      new Date(2026, 7, 14, 1),
      new Date(2026, 0, 1, 16, 45),
    );
    expect([
      result.getFullYear(),
      result.getMonth(),
      result.getDate(),
      result.getHours(),
      result.getMinutes(),
    ]).toEqual([2026, 7, 14, 16, 45]);
  });

  it("makes all-day end dates exclusive and at least one day long", () => {
    const start = new Date(2026, 7, 14, 14);
    const range = normalizeAllDayRange(start, new Date(2026, 7, 14, 18));
    expect(range.start.getHours()).toBe(0);
    expect(range.end.getDate()).toBe(15);
    expect(validateEventDateRange(range.start, range.end)).toBeNull();
  });

  it("parses the date portion of all-day server values in local time", () => {
    const result = parseAllDayDate("2026-08-14T00:00:00.000Z", new Date());
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual(
      [2026, 7, 14],
    );
  });

  it("rejects reversed ranges and includes the selected timezone in payloads", () => {
    const start = new Date(2026, 7, 14, 11);
    const end = new Date(2026, 7, 14, 10);
    expect(validateEventDateRange(start, end)).toBe(
      "The event must end after it starts.",
    );
    expect(
      buildEventDatePayload(
        start,
        new Date(2026, 7, 14, 12),
        false,
        "America/Edmonton",
      ).timezone,
    ).toBe("America/Edmonton");
  });
});
