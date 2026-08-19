import type { ParsedCalendarEvent } from "../shared/ics";
import type { SourceEvent } from "../../../core/types";
import type { SyncWindow } from "../../../core/sync/sync-range";
import type { IcsRecurrenceRule } from "ts-ics";
import { isKeeperEvent } from "../../../core/events/identity";
import { overlapsTimeWindow } from "../../../core/events/time-range";

/* The CalDAV time-range filter matches masters through recurrence expansion (RFC 4791 §9.9). */
const isRecurringSeriesInSyncWindow = (
  event: { endTime: Date; startTime: Date },
  recurrenceRule: IcsRecurrenceRule,
  syncWindow: SyncWindow,
): boolean => {
  if (event.startTime.getTime() >= syncWindow.timeMax.getTime()) {
    return false;
  }
  const { until } = recurrenceRule;
  /* COUNT-terminated and open-ended rules have no end bound short of full expansion. */
  if (!until) {
    return true;
  }
  const occurrenceDurationMs = event.endTime.getTime() - event.startTime.getTime();
  const lastOccurrenceEndMs = new Date(until.date).getTime() + occurrenceDurationMs;
  return lastOccurrenceEndMs > syncWindow.timeMin.getTime();
};

const isCalDAVEventInSyncWindow = (
  event: { endTime: Date; recurrenceRule?: IcsRecurrenceRule | null; startTime: Date },
  syncWindow: SyncWindow,
): boolean => {
  if (event.recurrenceRule) {
    return isRecurringSeriesInSyncWindow(event, event.recurrenceRule, syncWindow);
  }
  return overlapsTimeWindow(event, syncWindow.timeMin, syncWindow.timeMax);
};

interface CalDAVSourceEventPartition {
  events: SourceEvent[];
  outsideSyncWindowCount: number;
  selfAuthoredEventCount: number;
}

const toSourceEvent = (parsed: ParsedCalendarEvent): SourceEvent => ({
  availability: parsed.availability,
  description: parsed.description,
  endTime: parsed.endTime,
  exceptionDates: parsed.exceptionDates,
  isAllDay: parsed.isAllDay,
  location: parsed.location,
  recurrenceDuration: parsed.recurrenceDuration,
  recurrenceId: parsed.recurrenceId,
  recurrenceRule: parsed.recurrenceRule,
  startTime: parsed.startTime,
  startTimeZone: parsed.startTimeZone,
  title: parsed.title,
  uid: parsed.uid,
});

const partitionCalDAVSourceEvents = (
  parsedEvents: ParsedCalendarEvent[],
  syncWindow: SyncWindow,
): CalDAVSourceEventPartition => {
  const foreignEvents = parsedEvents.filter((parsed) => !isKeeperEvent(parsed.uid));
  const inWindowEvents = foreignEvents.filter(
    (parsed) => isCalDAVEventInSyncWindow(parsed, syncWindow),
  );
  return {
    events: inWindowEvents.map((parsed) => toSourceEvent(parsed)),
    outsideSyncWindowCount: foreignEvents.length - inWindowEvents.length,
    selfAuthoredEventCount: parsedEvents.length - foreignEvents.length,
  };
};

const buildCalDAVSourceEvents = (
  parsedEvents: ParsedCalendarEvent[],
  syncWindow: SyncWindow,
): SourceEvent[] => partitionCalDAVSourceEvents(parsedEvents, syncWindow).events;

export { buildCalDAVSourceEvents, isCalDAVEventInSyncWindow, partitionCalDAVSourceEvents };
export type { CalDAVSourceEventPartition };
