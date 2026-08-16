import {
  googleApiErrorSchema,
  googleEventWithAttendeesListSchema,
  googleEventWithAttendeesSchema,
} from "@keeper.sh/data-schemas";
import type { GoogleEventWithAttendees } from "@keeper.sh/data-schemas";
import { HTTP_STATUS, TWO_WAY_SOURCE_WRITE_TIMEOUT_MS } from "@keeper.sh/constants";
import { fetchWithTimeout } from "../../../core/utils/fetch-with-timeout";
import { GOOGLE_CALENDAR_API, GONE_STATUS } from "../shared/api";
import { ATTENDEE_REFUSAL } from "../../../core/source/writer";
import type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteResult,
} from "../../../core/source/writer";

const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
const ISO_DATE_LENGTH = 10;

interface GoogleSourceWriterConfig {
  accessToken: () => Promise<string>;
  externalCalendarId: string | null;
}

class GoogleSourceLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSourceLookupError";
  }
}

type EventLookup =
  | { error: string }
  | { event: GoogleEventWithAttendees | null };

/*
 * A source event with other people on it is a meeting, and Google notifies every one of
 * them when the organizer moves or deletes it. That notice cannot be recalled and the
 * attendee list cannot be rebuilt, so a mirrored copy is never allowed to reach it. The
 * user's own entry is the one attendee that names nobody else.
 */
const hasOtherAttendees = (event: GoogleEventWithAttendees): boolean =>
  (event.attendees ?? []).some((attendee) => attendee.self !== true);

const buildHeaders = (accessToken: string): Record<string, string> => ({
  "Authorization": `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

const resolveCalendarId = (externalCalendarId: string | null): string =>
  externalCalendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;

/*
 * A deletion interrupted between the provider call and the local commit is retried, and
 * Google answers the second attempt 410 rather than 404. Reading that as a failure would
 * spend the failure budget on work that is already done and quarantine the pair forever.
 */
const isAlreadyGone = (status: number): boolean =>
  status === HTTP_STATUS.NOT_FOUND || status === GONE_STATUS;

const readErrorMessage = async (response: Response): Promise<string> => {
  const body = await response.json();
  const { error } = googleApiErrorSchema.assert(body);
  return error?.message ?? response.statusText;
};

/*
 * Google re-homes an event to the calendar's default zone when a dateTime arrives with
 * no timeZone beside it. The zone is never read back from a destination, so what travels
 * here is the source's own stored zone: a preservation, not a propagation.
 */
const buildDateField = (
  value: Date,
  isAllDay: boolean,
  startTimeZone?: string,
): { date: string } | { dateTime: string; timeZone?: string } => {
  if (isAllDay) {
    return { date: value.toISOString().slice(0, ISO_DATE_LENGTH) };
  }
  return {
    dateTime: value.toISOString(),
    ...(startTimeZone && { timeZone: startTimeZone }),
  };
};

const buildScheduleFields = (updates: SourceEventUpdate): Record<string, unknown> => {
  if (!updates.startTime && !updates.endTime) {
    return {};
  }
  if (typeof updates.isAllDay !== "boolean") {
    throw new TypeError("A Google source schedule write must carry the event's all-day flag");
  }
  const { isAllDay, startTimeZone } = updates;
  return {
    ...(updates.startTime && {
      start: buildDateField(updates.startTime, isAllDay, startTimeZone),
    }),
    ...(updates.endTime && { end: buildDateField(updates.endTime, isAllDay, startTimeZone) }),
  };
};

const createGoogleSourceWriter = (
  config: GoogleSourceWriterConfig,
): CalendarSourceWriter => {
  /*
   * A lookup that failed is not an event that is gone. Reading a throttled or erroring
   * response as an absence would report a delete that never reached Google and destroy
   * the local record of an event still sitting on the user's calendar.
   */
  const findEventByUid = async (
    accessToken: string,
    sourceEventUid: string,
    signal?: AbortSignal,
  ): Promise<GoogleEventWithAttendees | null> => {
    const url = new URL(
      `calendars/${encodeURIComponent(resolveCalendarId(config.externalCalendarId))}/events`,
      GOOGLE_CALENDAR_API,
    );
    url.searchParams.set("iCalUID", sourceEventUid);

    const response = await fetchWithTimeout(
      url,
      { headers: buildHeaders(accessToken), method: "GET" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) {
      throw new GoogleSourceLookupError(await readErrorMessage(response));
    }
    const body = googleEventWithAttendeesListSchema.assert(await response.json());
    const [item] = body.items ?? [];
    return item ?? null;
  };

  const buildEventUrl = (eventId: string): URL =>
    new URL(
      `calendars/${encodeURIComponent(resolveCalendarId(config.externalCalendarId))}`
      + `/events/${encodeURIComponent(eventId)}`,
      GOOGLE_CALENDAR_API,
    );

  /*
   * The event is read even when its id is already known, because the id alone cannot say
   * whether anyone else is on it. A read that failed is not an event with no attendees.
   */
  const findEventById = async (
    accessToken: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<GoogleEventWithAttendees | null> => {
    const response = await fetchWithTimeout(
      buildEventUrl(eventId),
      { headers: buildHeaders(accessToken), method: "GET" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (isAlreadyGone(response.status)) {
      await response.body?.cancel?.();
      return null;
    }
    if (!response.ok) {
      throw new GoogleSourceLookupError(await readErrorMessage(response));
    }
    return googleEventWithAttendeesSchema.assert(await response.json());
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
      if (error instanceof GoogleSourceLookupError) {
        return { error: error.message };
      }
      throw error;
    }
  };

  const resolveWritableEventId = (
    lookup: { event: GoogleEventWithAttendees | null },
    reference: { sourceEventId: string | null },
  ): { eventId: string | null } | { refusal: SourceWriteResult } => {
    const { event } = lookup;
    if (!event) {
      return { eventId: null };
    }
    if (hasOtherAttendees(event)) {
      return { refusal: ATTENDEE_REFUSAL };
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
    const writable = resolveWritableEventId(lookup, reference);
    if ("refusal" in writable) {
      return writable.refusal;
    }
    const { eventId } = writable;
    if (!eventId) {
      return { error: "Event not found on Google Calendar.", success: false };
    }

    const patch = {
      ...("summary" in updates && { summary: updates.summary }),
      ...("description" in updates && { description: updates.description }),
      ...("location" in updates && { location: updates.location }),
      ...buildScheduleFields(updates),
    };

    const response = await fetchWithTimeout(
      buildEventUrl(eventId),
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
    const writable = resolveWritableEventId(lookup, reference);
    if ("refusal" in writable) {
      return writable.refusal;
    }
    const { eventId } = writable;
    if (!eventId) {
      return { success: true };
    }

    const response = await fetchWithTimeout(
      buildEventUrl(eventId),
      { headers: buildHeaders(accessToken), method: "DELETE" },
      TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
      signal,
    );
    if (!response.ok && !isAlreadyGone(response.status)) {
      return { error: await readErrorMessage(response), success: false };
    }
    await response.body?.cancel?.();
    return { success: true };
  };

  return { deleteEvent, updateEvent };
};

export { createGoogleSourceWriter };
export type { GoogleSourceWriterConfig };
