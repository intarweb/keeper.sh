import type { CalendarDetail, SyncRange } from "@/api/domain";

export const SYNC_RANGE_OPTIONS: readonly {
  label: string;
  value: SyncRange;
}[] = [
  { label: "1 Week", value: "1_week" },
  { label: "1 Month", value: "1_month" },
  { label: "3 Months", value: "3_months" },
  { label: "6 Months", value: "6_months" },
  { label: "12 Months", value: "12_months" },
  { label: "2 Years", value: "2_years" },
];

export function isPullCapable(
  calendar: Pick<CalendarDetail, "capabilities">,
): boolean {
  return calendar.capabilities.includes("pull");
}

export function isPushCapable(
  calendar: Pick<CalendarDetail, "capabilities">,
): boolean {
  return calendar.capabilities.includes("push");
}

export function toggleEventName(
  syncEventNames: boolean,
): Pick<CalendarDetail, "customEventName" | "excludeEventName"> {
  return syncEventNames
    ? { customEventName: "{{event_name}}", excludeEventName: false }
    : { customEventName: "{{calendar_name}}", excludeEventName: true };
}

export type CalendarSettingsPatch = Partial<
  Pick<
    CalendarDetail,
    | "name"
    | "customEventName"
    | "excludeAllDayEvents"
    | "excludeEventDescription"
    | "excludeEventLocation"
    | "excludeEventName"
    | "excludeFocusTime"
    | "excludeOutOfOffice"
    | "treatFullDayTimedEventsAsAllDay"
    | "syncFutureRange"
    | "syncHistoricRange"
  >
>;

export function buildCalendarSettingsPatch(
  calendar: CalendarDetail,
  canUseEventFilters: boolean,
): CalendarSettingsPatch {
  const patch: CalendarSettingsPatch = { name: calendar.name };
  if (!canUseEventFilters) return patch;

  if (isPullCapable(calendar)) {
    Object.assign(patch, {
      customEventName: calendar.customEventName,
      excludeAllDayEvents: calendar.excludeAllDayEvents,
      excludeEventDescription: calendar.excludeEventDescription,
      excludeEventLocation: calendar.excludeEventLocation,
      excludeEventName: calendar.excludeEventName,
    });
    if (calendar.calendarType === "ical")
      patch.treatFullDayTimedEventsAsAllDay =
        calendar.treatFullDayTimedEventsAsAllDay;
    if (calendar.provider === "google") {
      patch.excludeFocusTime = calendar.excludeFocusTime;
      patch.excludeOutOfOffice = calendar.excludeOutOfOffice;
    }
  }
  if (isPushCapable(calendar)) {
    patch.syncFutureRange = calendar.syncFutureRange;
    patch.syncHistoricRange = calendar.syncHistoricRange;
  }
  return patch;
}
