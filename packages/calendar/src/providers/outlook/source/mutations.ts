import {
  microsoftApiErrorSchema,
  outlookEventWithAttendeesListSchema,
  outlookEventWithAttendeesSchema,
} from "@keeper.sh/data-schemas";
import type { OutlookEventWithAttendees } from "@keeper.sh/data-schemas";
import { HTTP_STATUS, TWO_WAY_SOURCE_WRITE_TIMEOUT_MS } from "@keeper.sh/constants";
import { fetchWithTimeout } from "../../../core/utils/fetch-with-timeout";
import { instantToWallTime } from "../../../ics/utils/timezone-instant";
import {
  ATTENDEE_REFUSAL,
  AUTHORSHIP_REFUSAL,
  RICH_BODY_REFUSAL,
} from "../../../core/source/writer";
import type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteResult,
} from "../../../core/source/writer";

const MICROSOFT_GRAPH_API = "https://graph.microsoft.com/v1.0";
const SINGLE_RESULT = "1";

interface OutlookSourceWriterConfig {
  accessToken: () => Promise<string>;
  accountEmail?: string | null;
}

class OutlookSourceLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlookSourceLookupError";
  }
}

type EventLookup =
  | { error: string }
  | { event: OutlookEventWithAttendees | null };

/*
 * The lookup runs before Outlook is asked to change or destroy anything, so every way it
 * can fail — a typed error, an error body that is a gateway's HTML rather than JSON, a
 * response that does not match the schema, a socket that never connected — is a failure
 * that touched nothing. It has to reach the caller as an answer it can read: an exception
 * is indistinguishable from one raised after the write, and the write-back pass can only
 * release the record of a deletion it knows did not happen.
 */
const describeLookupFailure = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "The Outlook lookup failed.";
};

/*
 * Graph sends a meeting update to every attendee when the organizer changes an event, and
 * a cancellation to every one of them when the organizer deletes it. Neither notice can be
 * recalled, so a mirrored copy is never allowed to reach an event that carries attendees.
 */
const hasAttendees = (event: OutlookEventWithAttendees): boolean =>
  (event.attendees ?? []).length > 0;

const isSameAddress = (first: string, second: string): boolean =>
  first.trim().toLowerCase() === second.trim().toLowerCase();

/*
 * A mailbox a colleague shared with write access carries their events, and Graph lets the
 * grant delete one. Only positive evidence that somebody else owns the event refuses; an
 * event Graph describes too thinly to place still writes, behind the attendee guard.
 */
const isAuthoredBySomeoneElse = (
  event: OutlookEventWithAttendees,
  accountEmail: string | null | undefined,
): boolean => {
  if (event.isOrganizer === false) {
    return true;
  }
  const organizerAddress = event.organizer?.emailAddress?.address;
  if (!accountEmail || !organizerAddress) {
    return false;
  }
  return !isSameAddress(organizerAddress, accountEmail);
};

const HTML_BODY_CONTENT_TYPE = "html";
const MARKUP_PATTERN = /<[^>]*>/gu;
const HTML_ENTITY_PATTERN = /&[a-z]+;|&#\d+;/giu;
const EMPTY_LENGTH = 0;

/*
 * An html body Graph reports as empty of text and of anchors carries nothing a plain-text
 * write could destroy, so the description still travels there. Anything else is treated as
 * markup Keeper.sh never held: every body it reads arrives rendered to text, so it cannot
 * tell a bolded word from an unbolded one, and a write would replace both with the text.
 */
const carriesUnreadableMarkup = (event: OutlookEventWithAttendees): boolean => {
  const { body } = event;
  if (!body || body.contentType !== HTML_BODY_CONTENT_TYPE) {
    return false;
  }
  const content = body.content ?? "";
  const text = content
    .replaceAll(MARKUP_PATTERN, " ")
    .replaceAll(HTML_ENTITY_PATTERN, " ")
    .trim();
  return text.length > EMPTY_LENGTH || content.includes("<a ") || content.includes("<img");
};

const buildHeaders = (accessToken: string): Record<string, string> => ({
  "Authorization": `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

const readErrorMessage = async (response: Response): Promise<string> => {
  const body = await response.json();
  const { error } = microsoftApiErrorSchema.assert(body);
  return error?.message ?? response.statusText;
};

const UTC_TIME_ZONE = "UTC";

/*
 * Graph reads dateTime as a wall clock inside timeZone, so a UTC instant sent beside the
 * source's own zone would move the event. The zone is never read back from a destination:
 * what travels here is the source's own stored zone, a preservation rather than a
 * propagation. An all-day event is stored at midnight UTC and Graph requires it to start
 * at midnight in whatever zone accompanies it, so it keeps travelling as UTC.
 */
const resolveWriteTimeZone = (updates: SourceEventUpdate, isAllDay: boolean): string => {
  if (isAllDay) {
    return UTC_TIME_ZONE;
  }
  return updates.startTimeZone ?? UTC_TIME_ZONE;
};

const buildDateTimeField = (
  value: Date,
  timeZone: string,
): { dateTime: string; timeZone: string } => ({
  dateTime: instantToWallTime(value, timeZone).toISOString().replace("Z", ""),
  timeZone,
});

const buildScheduleFields = (updates: SourceEventUpdate): Record<string, unknown> => {
  if (!updates.startTime && !updates.endTime) {
    return {};
  }
  if (typeof updates.isAllDay !== "boolean") {
    throw new TypeError("An Outlook source schedule write must carry the event's all-day flag");
  }
  const { isAllDay } = updates;
  const timeZone = resolveWriteTimeZone(updates, isAllDay);
  return {
    isAllDay,
    ...(updates.startTime && { start: buildDateTimeField(updates.startTime, timeZone) }),
    ...(updates.endTime && { end: buildDateTimeField(updates.endTime, timeZone) }),
  };
};

/*
 * Whoever invites the user picks the UID of the event that lands on their calendar, so a
 * quote in it would close the filter's literal and let the rest of the UID name a
 * different event for the update or the delete to land on.
 */
const quoteODataLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const createOutlookSourceWriter = (
  config: OutlookSourceWriterConfig,
): CalendarSourceWriter => {
  /*
   * A lookup that failed is not an event that is gone. Reading a throttled or erroring
   * response as an absence would report a delete that never reached Graph and destroy the
   * local record of an event still sitting on the user's calendar.
   */
  const findEventByUid = async (
    accessToken: string,
    sourceEventUid: string,
    signal?: AbortSignal,
  ): Promise<OutlookEventWithAttendees | null> => {
    const url = new URL(`${MICROSOFT_GRAPH_API}/me/events`);
    url.searchParams.set("$filter", `iCalUId eq ${quoteODataLiteral(sourceEventUid)}`);
    url.searchParams.set("$top", SINGLE_RESULT);

    const response = await fetchWithTimeout(
      url,
      { headers: buildHeaders(accessToken), method: "GET" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) {
      throw new OutlookSourceLookupError(await readErrorMessage(response));
    }
    const body = outlookEventWithAttendeesListSchema.assert(await response.json());
    const [item] = body.value ?? [];
    return item ?? null;
  };

  /*
   * The event is read even when its id is already known, because the id alone cannot say
   * whether anyone else is on it. A read that failed is not an event with no attendees.
   */
  const findEventById = async (
    accessToken: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<OutlookEventWithAttendees | null> => {
    const response = await fetchWithTimeout(
      new URL(`${MICROSOFT_GRAPH_API}/me/events/${eventId}`),
      { headers: buildHeaders(accessToken), method: "GET" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (response.status === HTTP_STATUS.NOT_FOUND) {
      await response.body?.cancel?.();
      return null;
    }
    if (!response.ok) {
      throw new OutlookSourceLookupError(await readErrorMessage(response));
    }
    return outlookEventWithAttendeesSchema.assert(await response.json());
  };

  const resolveEvent = async (
    accessToken: string,
    reference: { sourceEventId: string | null; sourceEventUid: string },
    signal?: AbortSignal,
  ): Promise<EventLookup> => {
    try {
      if (reference.sourceEventId) {
        return { event: await findEventById(accessToken, reference.sourceEventId, signal) };
      }
      return { event: await findEventByUid(accessToken, reference.sourceEventUid, signal) };
    } catch (error) {
      return { error: describeLookupFailure(error) };
    }
  };

  const resolveWritableEventId = (
    lookup: { event: OutlookEventWithAttendees | null },
    reference: { sourceEventId: string | null },
    writesDescription: boolean,
  ): { eventId: string | null } | { refusal: SourceWriteResult } => {
    const { event } = lookup;
    if (!event) {
      return { eventId: null };
    }
    if (hasAttendees(event)) {
      return { refusal: ATTENDEE_REFUSAL };
    }
    if (isAuthoredBySomeoneElse(event, config.accountEmail)) {
      return { refusal: AUTHORSHIP_REFUSAL };
    }
    if (writesDescription && carriesUnreadableMarkup(event)) {
      return { refusal: RICH_BODY_REFUSAL };
    }
    return { eventId: event.id ?? reference.sourceEventId };
  };

  const updateEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    updates: SourceEventUpdate,
    signal?: AbortSignal,
  ): Promise<SourceWriteResult> => {
    const accessToken = await config.accessToken();
    const lookup = await resolveEvent(accessToken, reference, signal);
    if ("error" in lookup) {
      return { error: lookup.error, success: false };
    }
    const writable = resolveWritableEventId(lookup, reference, "description" in updates);
    if ("refusal" in writable) {
      return writable.refusal;
    }
    const { eventId } = writable;
    if (!eventId) {
      return { error: "Event not found on Outlook.", success: false };
    }

    const patch = {
      ...("summary" in updates && { subject: updates.summary }),
      ...("description" in updates && {
        body: { content: updates.description, contentType: "text" },
      }),
      ...("location" in updates && { location: { displayName: updates.location } }),
      ...buildScheduleFields(updates),
    };

    const response = await fetchWithTimeout(
      new URL(`${MICROSOFT_GRAPH_API}/me/events/${eventId}`),
      { body: JSON.stringify(patch), headers: buildHeaders(accessToken), method: "PATCH" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) {
      return { error: await readErrorMessage(response), success: false };
    }
    await response.body?.cancel?.();
    return { success: true };
  };

  const deleteEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    signal?: AbortSignal,
  ): Promise<SourceWriteResult> => {
    const accessToken = await config.accessToken();
    const lookup = await resolveEvent(accessToken, reference, signal);
    if ("error" in lookup) {
      return { error: lookup.error, success: false };
    }
    const writable = resolveWritableEventId(lookup, reference, false);
    if ("refusal" in writable) {
      return writable.refusal;
    }
    const { eventId } = writable;
    if (!eventId) {
      return { success: true };
    }

    const response = await fetchWithTimeout(
      new URL(`${MICROSOFT_GRAPH_API}/me/events/${eventId}`),
      { headers: buildHeaders(accessToken), method: "DELETE" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (!response.ok && response.status !== HTTP_STATUS.NOT_FOUND) {
      return { error: await readErrorMessage(response), success: false };
    }
    await response.body?.cancel?.();
    return { success: true };
  };

  return { deleteEvent, updateEvent };
};

export { createOutlookSourceWriter };
export type { OutlookSourceWriterConfig };
