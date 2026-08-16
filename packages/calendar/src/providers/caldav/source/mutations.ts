import { convertIcsCalendar, generateIcsCalendar } from "ts-ics";
import type { IcsCalendar, IcsEvent } from "ts-ics";
import { buildZonedIcsDate } from "../../../ics/utils/build-zoned-date";
import {
  collectDefinedTimezoneIds,
  extractProperties,
  hasEventAttendees,
  patchIcsEvent,
  readEventOrganizers,
} from "./patch-ics";
import { ATTENDEE_REFUSAL, AUTHORSHIP_REFUSAL } from "../../../core/source/writer";
import type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteResult,
} from "../../../core/source/writer";

const NOT_FOUND_STATUS = 404;
const OK_STATUS = 200;
const REDIRECT_STATUS = 300;
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
  accountEmail?: string | null;
  accountUsername?: string | null;
  calendarUrl: string;
  client: () => Promise<CalDAVWriterClient>;
}

const MAILTO_PREFIX = "mailto:";

const normalizeOrganizerAddress = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith(MAILTO_PREFIX)) {
    return trimmed.slice(MAILTO_PREFIX.length);
  }
  return trimmed;
};

/*
 * A CalDAV calendar account is stored without an email — nothing in the connect flow ever
 * asks for one — so the login the credential was created with is the only address this
 * account is known by. It is an address on iCloud, Fastmail and every other server that
 * authenticates by email, and something else entirely on the servers that do not.
 */
const resolveAccountIdentity = (
  config: CalDAVSourceWriterConfig,
): string | null => {
  const stored = config.accountEmail?.trim().toLowerCase();
  if (stored) {
    return stored;
  }
  const login = config.accountUsername?.trim().toLowerCase();
  if (login?.includes("@")) {
    return login;
  }
  return null;
};

/*
 * Apple gives one account the same mailbox at all three of these, and its clients stamp
 * ORGANIZER with whichever the account was created under — routinely not the one the user
 * signs CalDAV in with. No @me.com or @mac.com address has been issued since 2012, so a
 * matching local part across the three names the same person and nobody else.
 */
const APPLE_ALIAS_DOMAINS = new Set(["icloud.com", "mac.com", "me.com"]);
const ADDRESS_PARTS = 2;

const splitAddress = (address: string): { domain: string; local: string } | null => {
  const parts = address.split("@");
  const [local, domain] = parts;
  if (parts.length !== ADDRESS_PARTS || !local || !domain) {
    return null;
  }
  return { domain, local };
};

const isSameAppleAccount = (organizer: string, identity: string): boolean => {
  const left = splitAddress(organizer);
  const right = splitAddress(identity);
  if (!left || !right) {
    return false;
  }
  return left.local === right.local
    && APPLE_ALIAS_DOMAINS.has(left.domain)
    && APPLE_ALIAS_DOMAINS.has(right.domain);
};

const isSameIdentity = (organizer: string, identity: string): boolean =>
  organizer === identity || isSameAppleAccount(organizer, identity);

/*
 * An ORGANIZER that cannot be compared to anything is not an event this account is known
 * to have written, and a shared collection is exactly where an unmatchable one appears.
 * Refusing costs the user an unsynced edit; guessing costs somebody else their event.
 */
const isAuthoredBySomeoneElse = (
  ics: string,
  identity: string | null,
): boolean => {
  const organizers = readEventOrganizers(ics);
  if (organizers.length === 0) {
    return false;
  }
  if (!identity) {
    return true;
  }
  return organizers.some((organizer) =>
    !isSameIdentity(normalizeOrganizerAddress(organizer), identity));
};

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

/*
 * Tsdav resolves a write with the raw fetch Response and rejects on nothing but a
 * transport error, so a server that refuses the write — a read-only share, a failed
 * precondition, an expired password — arrives here as a resolved value. Reading that as a
 * success would report an edit or a deletion of the user's real event that never happened.
 */
const readWriteStatus = (result: unknown): number => {
  if (typeof result !== "object" || result === null) {
    throw new Error("The CalDAV server returned no response to the write.");
  }
  const { status } = result as { status?: unknown };
  if (typeof status !== "number") {
    throw new TypeError("The CalDAV server returned no status for the write.");
  }
  return status;
};

const isSuccessfulStatus = (status: number): boolean =>
  status >= OK_STATUS && status < REDIRECT_STATUS;

const describeLookupFailure = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "The CalDAV lookup failed.";
};

const isLookupFailure = (
  located: CalDAVObject | null | { lookupError: string },
): located is { lookupError: string } =>
  located !== null && "lookupError" in located;

const createCalDAVSourceWriter = (
  config: CalDAVSourceWriterConfig,
): CalendarSourceWriter => {
  const identity = resolveAccountIdentity(config);

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

  /*
   * The lookup runs before the server is asked to change or destroy anything, so every way
   * it can fail touched nothing. It has to reach the caller as an answer it can read: an
   * exception is indistinguishable from one raised after the write, and the write-back
   * pass can only release the record of a deletion it knows did not happen.
   */
  const findObject = (
    client: CalDAVWriterClient,
    sourceEventUid: string,
  ): Promise<CalDAVObject | null | { lookupError: string }> =>
    locateObject(client, sourceEventUid).catch((error: unknown) => ({
      lookupError: describeLookupFailure(error),
    }));

  const updateEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    updates: SourceEventUpdate,
  ): Promise<SourceWriteResult> => {
    const client = await config.client();
    const located = await findObject(client, reference.sourceEventUid);
    if (isLookupFailure(located)) {
      return { error: located.lookupError, success: false };
    }
    const object = located;
    if (!object?.data) {
      return { error: "Event not found on the CalDAV server.", success: false };
    }
    if (hasEventAttendees(object.data)) {
      return ATTENDEE_REFUSAL;
    }
    if (isAuthoredBySomeoneElse(object.data, identity)) {
      return AUTHORSHIP_REFUSAL;
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

    const status = readWriteStatus(await client.updateCalendarObject({
      calendarObject: { data, url: object.url },
    }));
    if (!isSuccessfulStatus(status)) {
      return {
        error: `The CalDAV server refused the edit with status ${status}.`,
        success: false,
      };
    }
    return { success: true };
  };

  const deleteEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
  ): Promise<SourceWriteResult> => {
    const client = await config.client();
    const located = await findObject(client, reference.sourceEventUid);
    if (isLookupFailure(located)) {
      return { error: located.lookupError, success: false };
    }
    const object = located;
    if (!object) {
      return { success: true };
    }
    if (object.data && hasEventAttendees(object.data)) {
      return ATTENDEE_REFUSAL;
    }
    if (object.data && isAuthoredBySomeoneElse(object.data, identity)) {
      return AUTHORSHIP_REFUSAL;
    }

    const status = await client
      .deleteCalendarObject({ calendarObject: { url: object.url } })
      .then(readWriteStatus)
      .catch((error: unknown) => {
        if (isNotFoundError(error)) {
          return NOT_FOUND_STATUS;
        }
        throw error;
      });
    if (!isSuccessfulStatus(status) && status !== NOT_FOUND_STATUS) {
      return {
        error: `The CalDAV server refused the deletion with status ${status}.`,
        success: false,
      };
    }
    return { success: true };
  };

  return { deleteEvent, updateEvent };
};

export { createCalDAVSourceWriter };
export type { CalDAVSourceWriterConfig, CalDAVWriterClient };
