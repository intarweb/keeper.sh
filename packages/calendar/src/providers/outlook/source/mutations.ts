import { microsoftApiErrorSchema, outlookEventListSchema } from "@keeper.sh/data-schemas";
import type { OutlookEvent } from "@keeper.sh/data-schemas";
import { HTTP_STATUS, TWO_WAY_SOURCE_WRITE_TIMEOUT_MS } from "@keeper.sh/constants";
import { fetchWithTimeout } from "../../../core/utils/fetch-with-timeout";
import { instantToWallTime } from "../../../ics/utils/timezone-instant";
import type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteResult,
} from "../../../core/source/writer";

const MICROSOFT_GRAPH_API = "https://graph.microsoft.com/v1.0";
const SINGLE_RESULT = "1";

interface OutlookSourceWriterConfig {
  accessToken: () => Promise<string>;
}

class OutlookSourceLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlookSourceLookupError";
  }
}

type EventIdLookup = { error: string } | { eventId: string | null };

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
  ): Promise<OutlookEvent | null> => {
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
    const body = outlookEventListSchema.assert(await response.json());
    const [item] = body.value ?? [];
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
      if (error instanceof OutlookSourceLookupError) {
        return { error: error.message };
      }
      throw error;
    }
  };

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
    const lookup = await resolveEventId(accessToken, reference, signal);
    if ("error" in lookup) {
      return { error: lookup.error, success: false };
    }
    const { eventId } = lookup;
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
