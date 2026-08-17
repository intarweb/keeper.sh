export interface EventDatePayload {
  endTime: string;
  startTime: string;
  timezone: string;
}

export function parseEventDate(
  value: string | undefined,
  fallback: Date,
): Date {
  if (!value) return new Date(fallback);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

export function parseAllDayDate(
  value: string | undefined,
  fallback: Date,
): Date {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return localMidnight(parseEventDate(value, fallback));
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function combineLocalDateAndTime(datePart: Date, timePart: Date): Date {
  return new Date(
    datePart.getFullYear(),
    datePart.getMonth(),
    datePart.getDate(),
    timePart.getHours(),
    timePart.getMinutes(),
    0,
    0,
  );
}

export function localMidnight(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function normalizeAllDayRange(
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  const normalizedStart = localMidnight(start);
  let normalizedEnd = localMidnight(end);
  if (normalizedEnd.getTime() <= normalizedStart.getTime()) {
    normalizedEnd = new Date(normalizedStart);
    normalizedEnd.setDate(normalizedEnd.getDate() + 1);
  }
  return { start: normalizedStart, end: normalizedEnd };
}

export function validateEventDateRange(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return "Choose valid start and end dates.";
  if (end.getTime() <= start.getTime())
    return "The event must end after it starts.";
  return null;
}

export function buildEventDatePayload(
  start: Date,
  end: Date,
  isAllDay: boolean,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): EventDatePayload {
  const range = isAllDay ? normalizeAllDayRange(start, end) : { start, end };
  return {
    startTime: range.start.toISOString(),
    endTime: range.end.toISOString(),
    timezone,
  };
}
