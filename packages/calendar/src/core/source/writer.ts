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
 * The one refusal on this path that is irreversible for somebody other than the user:
 * moving or cancelling a meeting mails everyone invited, and no answer afterwards recalls
 * that. Every other write is the user's own data and the provider's grant is what decides
 * it — the server already answered whether this account may write here, and every native
 * client acts on that answer.
 *
 * It is decided on the attendees the writer can see, and it deliberately does not ask who
 * organizes the event. A CalDAV server that signs the user in by a bare username gives no
 * address to weigh an ORGANIZER against, so that question has no answer there — and a
 * question that cannot be answered must never itself become a refusal, which is what
 * withheld two-way sync from those servers entirely. Which entries count as "other" is
 * read from what each provider reports; this rule is stated once so the three cannot
 * drift apart under it again.
 */
const refuseWhenOthersAreInvited = (
  event: { hasOtherAttendees: boolean },
): SourceWriteResult | null => {
  if (event.hasOtherAttendees) {
    return ATTENDEE_REFUSAL;
  }
  return null;
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
  isRetryableWriteStatus,
  refuseWhenOthersAreInvited,
  RICH_BODY_REFUSAL,
  toWriteFailure,
};
export type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteRefusal,
  SourceWriteResult,
};
