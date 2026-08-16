import { describe, expect, it } from "vitest";
import { parseOutlookEvents } from "../../../src/providers/outlook/source/utils/fetch-events";
import type { OutlookCalendarEvent } from "../../../src/providers/outlook/source/types";

const SERIES_UID = "weekly-gym-series-uid";

const outlookInstance = (
  overrides: Partial<OutlookCalendarEvent>,
): OutlookCalendarEvent => ({
  end: { dateTime: "2027-05-11T15:00:00", timeZone: "UTC" },
  iCalUId: SERIES_UID,
  id: "occurrence-1",
  start: { dateTime: "2027-05-11T14:00:00", timeZone: "UTC" },
  subject: "Gym",
  ...overrides,
});

describe("an occurrence expanded out of an Outlook series survives the parse as a repeating event", () => {
  it("marks an instance carrying a series master id", () => {
    const [parsed] = parseOutlookEvents([
      outlookInstance({ seriesMasterId: "weekly-gym-master", type: "occurrence" }),
    ]);

    expect(parsed?.recurrenceId?.toISOString()).toBe("2027-05-11T14:00:00.000Z");
  });

  it("marks a modified instance of a series the same way", () => {
    const [parsed] = parseOutlookEvents([
      outlookInstance({ id: "occurrence-2", type: "exception" }),
    ]);

    expect(parsed?.recurrenceId?.toISOString()).toBe("2027-05-11T14:00:00.000Z");
  });

  it("leaves a one-off event unmarked so write-back still reaches it", () => {
    const [parsed] = parseOutlookEvents([
      outlookInstance({ id: "one-off", type: "singleInstance" }),
    ]);

    expect(parsed?.recurrenceId).toBeUndefined();
  });
});
