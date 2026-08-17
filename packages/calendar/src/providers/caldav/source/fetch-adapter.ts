import type { SourceEvent } from "../../../core/types";
import type { SourceIngestionPlan, SyncWindow } from "../../../core/sync/sync-range";
import type { FetchEventsResult } from "../../../core/sync-engine/ingest";
import type { SafeFetchOptions } from "../../../utils/safe-fetch";
import { isKeeperEvent } from "../../../core/events/identity";
import { CalDAVClient } from "../shared/client";
import { parseICalCalendarsToRemoteEvents } from "../shared/ics";

/**
 * A time-range fetch resolves in two phases: a calendar-query for hrefs,
 * then a multiget for their data. A resource can disappear between the two, and
 * the multiget also reports per-resource failures — but tsdav discards the DAV
 * status and both arrive as an object with no data. Treating the survivors as
 * the authoritative set would delete live events from every destination, so an
 * incomplete response fails the run instead. A genuine deletion resolves on the
 * next tick, when the first phase no longer lists the resource at all.
 */
class CalDAVPartialResponseError extends Error {
  public readonly missingCount: number;
  public readonly returnedCount: number;

  public constructor(returnedCount: number, missingCount: number) {
    super(
      `CalDAV returned ${missingCount} of ${returnedCount} calendar objects without data`,
    );
    this.name = "CalDAVPartialResponseError";
    this.missingCount = missingCount;
    this.returnedCount = returnedCount;
  }
}

interface CalDAVSourceFetcherConfig {
  authMethod?: "basic" | "digest";
  calendarUrl: string;
  serverUrl: string;
  username: string;
  password: string;
  safeFetchOptions?: SafeFetchOptions;
  plan: SourceIngestionPlan;
}

interface CalDAVSourceFetcher {
  fetchEvents: () => Promise<FetchEventsResult>;
}

/*
 * Recurring masters are kept regardless of their own start/end: the CalDAV
 * time-range filter already returned their in-window occurrences. Non-recurring
 * events use the same overlap test the rest of the pipeline uses, so a boundary
 * event is treated identically wherever the window is applied.
 */
const isCalDAVEventInSyncWindow = (
  event: { endTime: Date; recurrenceRule?: unknown; startTime: Date },
  syncWindow: SyncWindow,
): boolean => Boolean(event.recurrenceRule)
  || event.endTime > syncWindow.timeMin && event.startTime < syncWindow.timeMax;

const createCalDAVSourceFetcher = (config: CalDAVSourceFetcherConfig): CalDAVSourceFetcher => {
  const client = new CalDAVClient({
    authMethod: config.authMethod,
    credentials: { password: config.password, username: config.username },
    serverUrl: config.serverUrl,
  }, config.safeFetchOptions);

  const fetchEvents = async (): Promise<FetchEventsResult> => {
    const { futureRange, historicRange, window: syncWindow } = config.plan;
    const calendarUrl = await client.resolveCalendarUrl(config.calendarUrl);

    const objects = await client.fetchCalendarObjects({
      calendarUrl,
      timeRange: {
        end: syncWindow.timeMax.toISOString(),
        start: syncWindow.timeMin.toISOString(),
      },
    });

    const calendarData = objects.flatMap(({ data }) => {
      if (!data) {
        return [];
      }
      return [data];
    });
    if (calendarData.length !== objects.length) {
      throw new CalDAVPartialResponseError(
        objects.length,
        objects.length - calendarData.length,
      );
    }

    const events: SourceEvent[] = [];
    const parsedEvents = parseICalCalendarsToRemoteEvents(calendarData);

    for (const parsed of parsedEvents) {
      if (isKeeperEvent(parsed.uid)) {
        continue;
      }
      if (!isCalDAVEventInSyncWindow(parsed, syncWindow)) {
        continue;
      }

      events.push({
        availability: parsed.availability,
        description: parsed.description,
        endTime: parsed.endTime,
        exceptionDates: parsed.exceptionDates,
        recurrenceId: parsed.recurrenceId,
        isAllDay: parsed.isAllDay,
        location: parsed.location,
        recurrenceDuration: parsed.recurrenceDuration,
        recurrenceRule: parsed.recurrenceRule,
        startTime: parsed.startTime,
        startTimeZone: parsed.startTimeZone,
        title: parsed.title,
        uid: parsed.uid,
      });
    }

    return {
      events,
      syncWindow,
      coverage: {
        futureRange,
        historicRange,
        window: syncWindow,
      },
    };
  };

  return { fetchEvents };
};

export { CalDAVPartialResponseError, createCalDAVSourceFetcher, isCalDAVEventInSyncWindow };
export type { CalDAVSourceFetcherConfig, CalDAVSourceFetcher };
