import {
  DEFAULT_FUTURE_SYNC_RANGE,
  DEFAULT_HISTORIC_SYNC_RANGE,
  getConfigurableSyncWindow,
  getWiderSyncRange,
  parseStoredIcsExceptionDates,
  parseStoredIcsRecurrence,
} from "@keeper.sh/calendar";
import { syncRangeSchema } from "@keeper.sh/data-schemas";
import type { SyncRange } from "@keeper.sh/data-schemas";
import { formatEventsAsIcal } from "./ical-format";
import type { CalendarEvent, FeedSettings } from "./ical-format";

/**
 * A published feed is fetched whole on every poll and the ICS subscription
 * protocol has no pagination, so the horizon is the only thing that bounds it.
 * That horizon follows the widest range configured across the feed's own
 * calendars, so the feed carries exactly the events the user asked to keep. It
 * is deliberately not capped beyond that: a cap silently drops events a
 * subscriber is relying on, and a feed missing a meeting is worse than a large
 * one.
 */
interface FeedCalendar {
  id: string;
  syncFutureRange: string;
  syncHistoricRange: string;
}

interface IcalFeedQuery {
  windowEnd: Date;
  windowStart: Date;
}

const toSyncRange = (value: string, fallback: SyncRange): SyncRange => {
  if (syncRangeSchema.allows(value)) {
    return value;
  }
  return fallback;
};

const createIcalFeedQuery = (
  calendars: FeedCalendar[],
  now: Date = new Date(),
): IcalFeedQuery => {
  let historicRange: SyncRange = DEFAULT_HISTORIC_SYNC_RANGE;
  let futureRange: SyncRange = DEFAULT_FUTURE_SYNC_RANGE;
  for (const calendar of calendars) {
    historicRange = getWiderSyncRange(
      historicRange,
      toSyncRange(calendar.syncHistoricRange, DEFAULT_HISTORIC_SYNC_RANGE),
    );
    futureRange = getWiderSyncRange(
      futureRange,
      toSyncRange(calendar.syncFutureRange, DEFAULT_FUTURE_SYNC_RANGE),
    );
  }
  const window = getConfigurableSyncWindow(historicRange, futureRange, now);

  return {
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
  readFeedCalendars: (userId: string) => Promise<FeedCalendar[]>;
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

  const [settings, calendars] = await Promise.all([
    dependencies.readFeedSettings(userId),
    dependencies.readFeedCalendars(userId),
  ]);

  const feedSettings = settings ?? DEFAULT_FEED_SETTINGS;

  if (calendars.length === 0) {
    return formatEventsAsIcal([], feedSettings);
  }

  const rows = await dependencies.readFeedEvents(
    calendars.map(({ id }) => id),
    createIcalFeedQuery(calendars, dependencies.now),
  );

  return formatEventsAsIcal(rows.map((row) => toCalendarEvent(row)), feedSettings);
};

export {
  DEFAULT_FEED_SETTINGS,
  createIcalFeedQuery,
  generateCalendarFeed,
};
export type { FeedDependencies, IcalFeedQuery, StoredFeedEvent };
