import {
  getConfigurableSyncWindow,
  parseStoredIcsExceptionDates,
  parseStoredIcsRecurrence,
} from "@keeper.sh/calendar";
import type { SyncRange } from "@keeper.sh/data-schemas";
import { formatEventsAsIcal } from "./ical-format";
import type { CalendarEvent, FeedSettings } from "./ical-format";

/**
 * A published feed is fetched whole on every poll and the ICS subscription
 * protocol has no pagination, so the response has to be bounded in place.
 * The horizon reaches a year back and two years forward, which is wider than
 * the widest configurable sync range, and the row cap keeps even a pathological
 * feed under the ~1MB that subscribers such as Google Calendar tolerate
 * (a fully detailed VEVENT measures roughly 350 bytes).
 */
const ICAL_FEED_HISTORIC_RANGE: SyncRange = "12_months";
const ICAL_FEED_FUTURE_RANGE: SyncRange = "2_years";
const ICAL_FEED_EVENT_LIMIT = 2500;

interface IcalFeedQuery {
  limit: number;
  windowEnd: Date;
  windowStart: Date;
}

const createIcalFeedQuery = (now: Date = new Date()): IcalFeedQuery => {
  const window = getConfigurableSyncWindow(
    ICAL_FEED_HISTORIC_RANGE,
    ICAL_FEED_FUTURE_RANGE,
    now,
  );

  return {
    limit: ICAL_FEED_EVENT_LIMIT,
    windowEnd: window.timeMax,
    windowStart: window.timeMin,
  };
};

const DEFAULT_FEED_SETTINGS: FeedSettings = {
  includeEventName: false,
  includeEventDescription: false,
  includeEventLocation: false,
  excludeAllDayEvents: false,
  customEventName: "Busy",
};

type StoredFeedEvent = Omit<
  CalendarEvent,
  "exceptionDates" | "recurrenceDuration" | "recurrenceRule"
> & {
  exceptionDates: string | null;
  recurrenceRule: string | null;
};

interface FeedDependencies {
  now?: Date;
  resolveUserIdentifier: (identifier: string) => Promise<string | null>;
  readFeedSettings: (userId: string) => Promise<FeedSettings | null>;
  readFeedCalendarIds: (userId: string) => Promise<string[]>;
  readFeedEvents: (
    calendarIds: string[],
    query: IcalFeedQuery,
  ) => Promise<StoredFeedEvent[]>;
}

const toCalendarEvent = (row: StoredFeedEvent): CalendarEvent => {
  const recurrence = parseStoredIcsRecurrence(row.recurrenceRule, row.id);
  return {
    ...row,
    recurrenceDuration: recurrence?.recurrenceDuration ?? null,
    recurrenceRule: recurrence?.recurrenceRule ?? null,
    exceptionDates: parseStoredIcsExceptionDates(row.exceptionDates, row.id),
  };
};

const generateCalendarFeed = async (
  identifier: string,
  dependencies: FeedDependencies,
): Promise<string | null> => {
  const userId = await dependencies.resolveUserIdentifier(identifier);

  if (!userId) {
    return null;
  }

  const [settings, calendarIds] = await Promise.all([
    dependencies.readFeedSettings(userId),
    dependencies.readFeedCalendarIds(userId),
  ]);

  const feedSettings = settings ?? DEFAULT_FEED_SETTINGS;

  if (calendarIds.length === 0) {
    return formatEventsAsIcal([], feedSettings);
  }

  const rows = await dependencies.readFeedEvents(
    calendarIds,
    createIcalFeedQuery(dependencies.now),
  );

  return formatEventsAsIcal(rows.map((row) => toCalendarEvent(row)), feedSettings);
};

export {
  DEFAULT_FEED_SETTINGS,
  ICAL_FEED_EVENT_LIMIT,
  createIcalFeedQuery,
  generateCalendarFeed,
};
export type { FeedDependencies, IcalFeedQuery, StoredFeedEvent };
