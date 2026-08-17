import { describe, expect, it } from "vitest";

import type { CalendarDetail } from "../src/api/domain";
import {
  buildCalendarSettingsPatch,
  SYNC_RANGE_OPTIONS,
  toggleEventName,
} from "../src/features/calendar/calendar-settings-logic";

function detail(overrides: Partial<CalendarDetail> = {}): CalendarDetail {
  return {
    id: "calendar",
    name: "Calendar",
    originalName: null,
    calendarType: "google",
    capabilities: ["pull", "push"],
    provider: "google",
    providerName: "Google",
    providerIcon: null,
    url: null,
    calendarUrl: null,
    customEventName: "{{event_name}}",
    excludeAllDayEvents: false,
    excludeEventDescription: false,
    excludeEventLocation: false,
    excludeEventName: false,
    excludeFocusTime: false,
    excludeOutOfOffice: false,
    treatFullDayTimedEventsAsAllDay: false,
    syncFutureRange: "2_years",
    syncHistoricRange: "1_month",
    destinationIds: [],
    sourceIds: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
    disabled: overrides.disabled ?? false,
  };
}

describe("calendar settings payload", () => {
  it("uses the exact supported sync ranges", () => {
    expect(SYNC_RANGE_OPTIONS.map(({ value }) => value)).toEqual([
      "1_week",
      "1_month",
      "3_months",
      "6_months",
      "12_months",
      "2_years",
    ]);
  });

  it("only sends rename when advanced filters are not entitled", () => {
    expect(buildCalendarSettingsPatch(detail(), false)).toEqual({
      name: "Calendar",
    });
  });

  it("omits provider-specific and capability-specific settings", () => {
    const patch = buildCalendarSettingsPatch(
      detail({
        capabilities: ["pull"],
        provider: "microsoft",
        calendarType: "outlook",
      }),
      true,
    );
    expect(patch).not.toHaveProperty("syncFutureRange");
    expect(patch).not.toHaveProperty("syncHistoricRange");
    expect(patch).not.toHaveProperty("excludeFocusTime");
    expect(patch).not.toHaveProperty("excludeOutOfOffice");
    expect(patch).not.toHaveProperty("treatFullDayTimedEventsAsAllDay");
    expect(patch.excludeEventName).toBe(false);
  });

  it("includes iCal normalization and Google exclusions only where supported", () => {
    expect(
      buildCalendarSettingsPatch(
        detail({ capabilities: ["pull"], calendarType: "ical" }),
        true,
      ),
    ).toHaveProperty("treatFullDayTimedEventsAsAllDay");
    expect(buildCalendarSettingsPatch(detail(), true)).toMatchObject({
      excludeFocusTime: false,
      excludeOutOfOffice: false,
      syncFutureRange: "2_years",
    });
  });

  it("keeps event-name template semantics aligned with the web app", () => {
    expect(toggleEventName(true)).toEqual({
      excludeEventName: false,
      customEventName: "{{event_name}}",
    });
    expect(toggleEventName(false)).toEqual({
      excludeEventName: true,
      customEventName: "{{calendar_name}}",
    });
  });
});
