interface SourceEventUpdate {
  description?: string;
  endTime?: Date;
  isAllDay?: boolean;
  location?: string;
  startTime?: Date;
  startTimeZone?: string;
  summary?: string;
}

/*
 * A refusal is not a failure. The provider was reachable and the write was understood; it
 * was declined because applying it would reach past the user, and no retry can change that.
 */
type SourceWriteRefusal =
  | "event_authored_by_someone_else"
  | "event_body_is_rich_text"
  | "event_has_attendees";

interface SourceWriteResult {
  error?: string;
  refused?: SourceWriteRefusal;
  retryable?: boolean;
  success: boolean;
}

/*
 * A throttle, a gateway failure and a request that timed out are the provider saying "not
 * right now". They are indistinguishable from a permanent refusal once the status is
 * discarded, and the pass that cannot tell them apart spends its failure budget on a few
 * throttled minutes, reverts the pair to one-way and discards the edit the user made on
 * the copy — over an outage that would have cleared on its own. The write is retried
 * instead; it is still counted, on a longer budget, so a provider that never recovers
 * still ends in a paused pair the user is told about rather than in a silent forever loop.
 */
const REQUEST_TIMEOUT = 408;
const TOO_EARLY = 425;
const TOO_MANY_REQUESTS = 429;
const PRECONDITION_FAILED = 412;
const INTERNAL_SERVER_ERROR = 500;
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;

/*
 * A CalDAV etag no longer matching is the same kind of answer: the object moved under the
 * write, and the next pass reads it again and writes against what is there now.
 */
const RETRYABLE_WRITE_STATUSES: ReadonlySet<number> = new Set([
  REQUEST_TIMEOUT,
  PRECONDITION_FAILED,
  TOO_EARLY,
  TOO_MANY_REQUESTS,
  INTERNAL_SERVER_ERROR,
  BAD_GATEWAY,
  SERVICE_UNAVAILABLE,
  GATEWAY_TIMEOUT,
]);

const isRetryableWriteStatus = (status: number): boolean =>
  RETRYABLE_WRITE_STATUSES.has(status);

/*
 * The flag is carried only when it is true, so a failure nothing can retry keeps the exact
 * shape it has always had and reads as the plain answer it is.
 */
const toWriteFailure = (error: string, retryable: boolean): SourceWriteResult => ({
  error,
  ...(retryable && { retryable: true }),
  success: false,
});

interface CalendarSourceWriter {
  deleteEvent: (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    signal?: AbortSignal,
  ) => Promise<SourceWriteResult>;
  updateEvent: (
    reference: { sourceEventId: string | null; sourceEventUid: string },
    updates: SourceEventUpdate,
    signal?: AbortSignal,
  ) => Promise<SourceWriteResult>;
}

const ATTENDEE_REFUSAL: SourceWriteResult = {
  error: "Keeper.sh does not write to a source event other people are invited to.",
  refused: "event_has_attendees",
  success: false,
};

/*
 * A calendar shared with write access carries other people's events, and a provider will
 * happily let the grant destroy one. Nobody but its author can put it back and its author
 * is never told, so an event this account did not create is not a mirror to reconcile.
 */
const AUTHORSHIP_REFUSAL: SourceWriteResult = {
  error: "Keeper.sh does not write to a source event someone else created.",
  refused: "event_authored_by_someone_else",
  success: false,
};

/*
 * Outlook hands Keeper.sh every body as text, so a body that carries markup was never
 * stored and cannot be reconstructed. Writing the text projection back replaces the real
 * event's links, formatting and the join block a meeting provider wrote into it, with
 * nothing anywhere to restore them from.
 */
const RICH_BODY_REFUSAL: SourceWriteResult = {
  error: "Keeper.sh does not replace a formatted source description with plain text.",
  refused: "event_body_is_rich_text",
  success: false,
};

export {
  ATTENDEE_REFUSAL,
  AUTHORSHIP_REFUSAL,
  isRetryableWriteStatus,
  RICH_BODY_REFUSAL,
  toWriteFailure,
};
export type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteRefusal,
  SourceWriteResult,
};
