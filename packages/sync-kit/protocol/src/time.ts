import type { Instant, ZoneId } from "./handles";

interface TimeWindow {
  readonly start: Instant;
  readonly end: Instant;
}

type CoverageWindow = TimeWindow;

interface EventTime {
  readonly isAllDay: boolean;
  readonly start: Instant;
  readonly end: Instant;
  readonly zone: ZoneId | null;
}

type WindowMembership = (window: TimeWindow, time: EventTime) => boolean;

export type { CoverageWindow, EventTime, TimeWindow, WindowMembership };
