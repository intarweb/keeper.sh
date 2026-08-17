import type { KeeperEvent } from "@/api/domain";
import { parseAllDayDate } from "./event-date-logic";

type DisplayEvent = Pick<
  KeeperEvent,
  "endTime" | "eventStateId" | "isAllDay" | "startTime" | "title"
>;

/** The API only permits mutation of direct events, identified by a null eventStateId. */
export function canMutateEvent(
  event: Pick<KeeperEvent, "eventStateId">,
): boolean {
  return event.eventStateId === null;
}

export function eventDisplayTitle(event: Pick<KeeperEvent, "title">): string {
  return event.title?.trim() || "Busy";
}

function allDayDate(value: string): Date {
  return parseAllDayDate(value, new Date(0));
}

export function eventDayLabel(
  event: Pick<KeeperEvent, "isAllDay" | "startTime">,
  locale?: string,
): string {
  const value = event.isAllDay
    ? allDayDate(event.startTime)
    : new Date(event.startTime);
  return value.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function eventTimeLabel(
  event: Pick<KeeperEvent, "endTime" | "isAllDay" | "startTime">,
  locale?: string,
): string {
  if (event.isAllDay) return "All Day";
  const format: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${new Date(event.startTime).toLocaleTimeString(locale, format)} – ${new Date(event.endTime).toLocaleTimeString(locale, format)}`;
}

export function eventDateRangeLabel(
  event: Pick<KeeperEvent, "endTime" | "isAllDay" | "startTime">,
  locale?: string,
): string {
  if (!event.isAllDay) {
    return `${new Date(event.startTime).toLocaleString(locale)} – ${new Date(event.endTime).toLocaleString(locale)}`;
  }
  const start = allDayDate(event.startTime);
  const inclusiveEnd = allDayDate(event.endTime);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const first = start.toLocaleDateString(locale, options);
  if (inclusiveEnd.getTime() <= start.getTime()) return `${first} · All Day`;
  return `${first} – ${inclusiveEnd.toLocaleDateString(locale, options)} · All Day`;
}

export function eventShareText(
  event: DisplayEvent & { location?: string | null },
): string {
  return `${eventDisplayTitle(event)}\n${eventDateRangeLabel(event)}${event.location ? `\n${event.location}` : ""}`;
}
