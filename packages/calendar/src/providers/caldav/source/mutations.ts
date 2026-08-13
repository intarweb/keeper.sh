import { convertIcsCalendar, generateIcsCalendar } from "ts-ics";
import type { IcsCalendar, IcsEvent } from "ts-ics";
import { buildZonedIcsDate } from "../../../ics/utils/build-zoned-date";
import {
  collectDefinedTimezoneIds,
  extractProperties,
  patchIcsEvent,
} from "./patch-ics";
import type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteResult,
} from "../../../core/source/writer";

const NOT_FOUND_STATUS = 404;
const KEEPER_PRODUCT_ID = "-//Keeper.sh//Keeper.sh//EN";
const ICALENDAR_VERSION = "2.0";

interface CalDAVObject {
  data?: string;
  url: string;
}

interface CalDAVWriterClient {
  deleteCalendarObject: (input: { calendarObject: { url: string } }) => Promise<unknown>;
  fetchCalendarObjects: (input: {
    calendar: { url: string };
    filters?: Record<string, unknown>;
    objectUrls?: string[];
  }) => Promise<CalDAVObject[]>;
  updateCalendarObject: (
    input: { calendarObject: { data: string; url: string } },
  ) => Promise<unknown>;
}

interface CalDAVSourceWriterConfig {
  calendarUrl: string;
  client: () => Promise<CalDAVWriterClient>;
}

const ensureTrailingSlash = (url: string): string => {
  if (url.endsWith("/")) {
    return url;
  }
  return `${url}/`;
};

const parseIcsString = (icsString: string): IcsCalendar =>
  // eslint-disable-next-line no-undefined -- convertIcsCalendar takes undefined when there is no schema
  convertIcsCalendar(undefined, icsString);

const buildUidFilter = (sourceEventUid: string): Record<string, unknown> => ({
  "comp-filter": {
    "_attributes": { name: "VCALENDAR" },
    "comp-filter": {
      "_attributes": { name: "VEVENT" },
      "prop-filter": {
        "_attributes": { name: "UID" },
        "text-match": { "_attributes": { collation: "i;octet" }, "_text": sourceEventUid },
      },
    },
  },
});

const resolveIsAllDay = (updates: SourceEventUpdate, event: IcsEvent): boolean => {
  if (typeof updates.isAllDay === "boolean") {
    return updates.isAllDay;
  }
  return event.start?.type === "DATE";
};

/*
 * A TZID the object does not define would leave the file referencing a timezone that is
 * not in it, so the event's own representation wins whenever the source's stored zone is
 * not already declared alongside it.
 */
const resolveTimezone = (
  event: IcsEvent,
  updates: SourceEventUpdate,
  definedTimezoneIds: ReadonlySet<string>,
): string | undefined => {
  const existing = event.start?.local?.timezone;
  if (existing) {
    return existing;
  }
  if (updates.startTimeZone && definedTimezoneIds.has(updates.startTimeZone)) {
    return updates.startTimeZone;
  }
  // eslint-disable-next-line no-undefined -- an absent zone is a bare UTC datetime
  return undefined;
};

const applyUpdatesToEvent = (
  event: IcsEvent,
  updates: SourceEventUpdate,
  timezone: string | undefined,
): IcsEvent => {
  const isAllDay = resolveIsAllDay(updates, event);
  const patch: Partial<IcsEvent> = {
    stamp: { date: new Date() },
    ...(typeof updates.summary === "string" && { summary: updates.summary }),
    ...("description" in updates && { description: updates.description }),
    ...("location" in updates && { location: updates.location }),
    ...(updates.startTime && {
      start: buildZonedIcsDate(updates.startTime, timezone, isAllDay),
    }),
    ...(updates.endTime && { end: buildZonedIcsDate(updates.endTime, timezone, isAllDay) }),
  };

  return { ...event, ...patch } as IcsEvent;
};

const collectChangedPropertyNames = (updates: SourceEventUpdate): Set<string> => {
  const names = new Set<string>(["DTSTAMP"]);
  if (typeof updates.summary === "string") {
    names.add("SUMMARY");
  }
  if ("description" in updates) {
    names.add("DESCRIPTION");
  }
  if ("location" in updates) {
    names.add("LOCATION");
  }
  if (updates.startTime) {
    names.add("DTSTART");
  }
  if (updates.endTime) {
    names.add("DTEND");
    names.add("DURATION");
  }
  return names;
};

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error && "status" in error && error.status === NOT_FOUND_STATUS;

const createCalDAVSourceWriter = (
  config: CalDAVSourceWriterConfig,
): CalendarSourceWriter => {
  const buildObjectUrl = (sourceEventUid: string): string =>
    `${ensureTrailingSlash(config.calendarUrl)}${sourceEventUid}.ics`;

  const matchesUid = (object: CalDAVObject, sourceEventUid: string): boolean => {
    if (!object.data) {
      return false;
    }
    const [event] = parseIcsString(object.data).events ?? [];
    return event?.uid === sourceEventUid;
  };

  /*
   * The object filename is chosen by whichever client created the event, so it only
   * happens to equal the UID for events Keeper.sh itself wrote. Guessing it and reading
   * the miss as "already gone" would report a delete that never reached the server.
   */
  const locateObject = async (
    client: CalDAVWriterClient,
    sourceEventUid: string,
  ): Promise<CalDAVObject | null> => {
    const direct = await client.fetchCalendarObjects({
      calendar: { url: config.calendarUrl },
      objectUrls: [buildObjectUrl(sourceEventUid)],
    }).catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    });
    const [candidate] = direct;
    if (candidate && matchesUid(candidate, sourceEventUid)) {
      return candidate;
    }

    const found = await client.fetchCalendarObjects({
      calendar: { url: config.calendarUrl },
      filters: buildUidFilter(sourceEventUid),
    });
    return found.find((object) => matchesUid(object, sourceEventUid)) ?? null;
  };

  const updateEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    updates: SourceEventUpdate,
  ): Promise<SourceWriteResult> => {
    const client = await config.client();
    const object = await locateObject(client, reference.sourceEventUid);
    if (!object?.data) {
      return { error: "Event not found on the CalDAV server.", success: false };
    }

    const [event] = parseIcsString(object.data).events ?? [];
    if (!event) {
      return { error: "Could not parse the event on the CalDAV server.", success: false };
    }

    const timezone = resolveTimezone(event, updates, collectDefinedTimezoneIds(object.data));
    const propertyNames = collectChangedPropertyNames(updates);
    const rendered = generateIcsCalendar({
      events: [applyUpdatesToEvent(event, updates, timezone)],
      prodId: KEEPER_PRODUCT_ID,
      version: ICALENDAR_VERSION,
    });
    const data = patchIcsEvent({
      ics: object.data,
      properties: extractProperties(rendered, propertyNames),
      propertyNames,
      uid: reference.sourceEventUid,
    });
    if (!data) {
      return {
        error: "Could not locate the event to edit inside the CalDAV object.",
        success: false,
      };
    }

    await client.updateCalendarObject({
      calendarObject: { data, url: object.url },
    });
    return { success: true };
  };

  const deleteEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
  ): Promise<SourceWriteResult> => {
    const client = await config.client();
    const object = await locateObject(client, reference.sourceEventUid);
    if (!object) {
      return { success: true };
    }

    try {
      await client.deleteCalendarObject({ calendarObject: { url: object.url } });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
    return { success: true };
  };

  return { deleteEvent, updateEvent };
};

export { createCalDAVSourceWriter };
export type { CalDAVSourceWriterConfig, CalDAVWriterClient };
