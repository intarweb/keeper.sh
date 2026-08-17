import type { CalendarSummary } from "@/api/domain";

export function includedIcalSourceCandidates(
  calendars: readonly CalendarSummary[],
): CalendarSummary[] {
  return calendars.filter((calendar) => calendar.capabilities.includes("pull"));
}
