import type { CalendarKey } from "./calendar-ref";
import type { CalendarDate, Instant, ZoneId } from "./handles";

interface TimeWindow {
  readonly start: Instant;
  readonly end: Instant;
}

interface CoverageWindow {
  readonly coveredFrom: Instant;
  readonly coveredTo: Instant;
  readonly calendar: CalendarKey;
}

type EventTime =
  | {
      readonly kind: "timed";
      readonly start: Instant;
      readonly end: Instant;
      readonly zone: ZoneId | null;
    }
  | {
      readonly kind: "allDay";
      readonly startDate: CalendarDate;
      readonly endDateExclusive: CalendarDate;
    };

type WindowMembership = (window: TimeWindow, time: EventTime) => boolean;

export type { CoverageWindow, EventTime, TimeWindow, WindowMembership };
