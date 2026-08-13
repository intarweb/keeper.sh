import { googleApiErrorSchema, googleEventWithAttendeesListSchema } from "@keeper.sh/data-schemas";
import type { GoogleEventWithAttendees } from "@keeper.sh/data-schemas";
import { HTTP_STATUS, TWO_WAY_SOURCE_WRITE_TIMEOUT_MS } from "@keeper.sh/constants";
import { fetchWithTimeout } from "../../../core/utils/fetch-with-timeout";
import { GOOGLE_CALENDAR_API, GONE_STATUS } from "../shared/api";
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

type EventIdLookup = { error: string } | { eventId: string | null };

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

  const resolveEventId = async (
    accessToken: string,
    reference: { sourceEventId: string | null; sourceEventUid: string },
    signal?: AbortSignal,
  ): Promise<EventIdLookup> => {
    if (reference.sourceEventId) {
      return { eventId: reference.sourceEventId };
    }
    try {
      const existing = await findEventByUid(accessToken, reference.sourceEventUid, signal);
      return { eventId: existing?.id ?? null };
    } catch (error) {
      if (error instanceof GoogleSourceLookupError) {
        return { error: error.message };
      }
      throw error;
    }
  };

  const buildEventUrl = (eventId: string): URL =>
    new URL(
      `calendars/${encodeURIComponent(resolveCalendarId(config.externalCalendarId))}`
      + `/events/${encodeURIComponent(eventId)}`,
      GOOGLE_CALENDAR_API,
    );

  const updateEvent = async (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    updates: SourceEventUpdate,
    signal?: AbortSignal,
  ): Promise<SourceWriteResult> => {
    const accessToken = await config.accessToken();
    const lookup = await resolveEventId(accessToken, reference, signal);
    if ("error" in lookup) {
      return { error: lookup.error, success: false };
    }
    const { eventId } = lookup;
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
    const lookup = await resolveEventId(accessToken, reference, signal);
    if ("error" in lookup) {
      return { error: lookup.error, success: false };
    }
    const { eventId } = lookup;
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
