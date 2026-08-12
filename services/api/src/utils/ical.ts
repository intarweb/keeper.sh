import { calendarsTable, eventStatesTable, icalFeedSettingsTable } from "@keeper.sh/database/schema";
import { and, asc, eq, gte, inArray, isNotNull, lte, ne, or, isNull } from "drizzle-orm";
import { resolveUserIdentifier } from "./user";
import { database } from "@/context";
import { generateCalendarFeed } from "./ical-feed";
import type { IcalFeedQuery, StoredFeedEvent } from "./ical-feed";
import type { FeedSettings } from "./ical-format";

const FIRST_RESULT_LIMIT = 1;

const readFeedSettings = async (userId: string): Promise<FeedSettings | null> => {
  const [settings] = await database
    .select()
    .from(icalFeedSettingsTable)
    .where(eq(icalFeedSettingsTable.userId, userId))
    .limit(FIRST_RESULT_LIMIT);

  return settings ?? null;
};

const readFeedCalendarIds = async (userId: string): Promise<string[]> => {
  const calendars = await database
    .select({ id: calendarsTable.id })
    .from(calendarsTable)
    .where(
      and(
        eq(calendarsTable.userId, userId),
        eq(calendarsTable.includeInIcalFeed, true),
      ),
    );

  return calendars.map(({ id }) => id);
};

const readFeedEvents = (
  calendarIds: string[],
  query: IcalFeedQuery,
): Promise<StoredFeedEvent[]> => database
  .select({
    calendarId: eventStatesTable.calendarId,
    id: eventStatesTable.id,
    title: eventStatesTable.title,
    description: eventStatesTable.description,
    location: eventStatesTable.location,
    startTime: eventStatesTable.startTime,
    endTime: eventStatesTable.endTime,
    availability: eventStatesTable.availability,
    startTimeZone: eventStatesTable.startTimeZone,
    isAllDay: eventStatesTable.isAllDay,
    recurrenceRule: eventStatesTable.recurrenceRule,
    exceptionDates: eventStatesTable.exceptionDates,
    recurrenceId: eventStatesTable.recurrenceId,
    sourceEventUid: eventStatesTable.sourceEventUid,
    calendarName: calendarsTable.name,
  })
  .from(eventStatesTable)
  .innerJoin(calendarsTable, eq(eventStatesTable.calendarId, calendarsTable.id))
  .where(
    and(
      inArray(eventStatesTable.calendarId, calendarIds),
      or(
        isNull(eventStatesTable.sourceEventType),
        ne(eventStatesTable.sourceEventType, "workingLocation"),
      ),
      or(
        isNull(eventStatesTable.availability),
        ne(eventStatesTable.availability, "workingElsewhere"),
      ),
      lte(eventStatesTable.startTime, query.windowEnd),
      or(
        gte(eventStatesTable.endTime, query.windowStart),
        isNotNull(eventStatesTable.recurrenceRule),
      ),
    ),
  )
  .orderBy(asc(eventStatesTable.startTime))
  .limit(query.limit);

const generateUserCalendar = (identifier: string): Promise<string | null> =>
  generateCalendarFeed(identifier, {
    readFeedCalendarIds,
    readFeedEvents,
    readFeedSettings,
    resolveUserIdentifier,
  });

export { generateUserCalendar };
