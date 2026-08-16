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
  /*
   * The request left, and no answer came back. Every status the provider can return says
   * what it did with the write; a socket that dies mid-flight says nothing, so a delete
   * reported this way may already have destroyed the real event. The record of it must
   * stand until a later read settles it.
   */
  indeterminate?: boolean;
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

/*
 * A connection reset, a DNS blip, a read that timed out on this side: the write was sent
 * and no status came back. It is the same "not right now" a 503 is — the difference is
 * only that the provider never got to say it — so it must be answered the same way, and
 * never thrown. An exception out of a writer is spent as a permanent defect: five of them
 * revert the pair to one-way, discard the edits the user made on the copies, and nothing
 * retries once the pair is off. It is marked indeterminate as well as retryable, because
 * unlike a status this answer cannot say whether the source event survived.
 */
const toTransportWriteFailure = (error: unknown, fallback: string): SourceWriteResult => ({
  error: (error instanceof Error && error.message) || fallback,
  indeterminate: true,
  retryable: true,
  success: false,
});

/*
 * Stated once so the three writers cannot drift apart under it: the final write is the
 * one call whose exception nothing else on the path can interpret.
 */
const attemptSourceWrite = async <T>(
  send: () => Promise<T>,
  fallback: string,
): Promise<{ failure: SourceWriteResult } | { sent: T }> => {
  try {
    return { sent: await send() };
  } catch (error) {
    return { failure: toTransportWriteFailure(error, fallback) };
  }
};

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

const UNREADABLE_ATTENDEE_REFUSAL: SourceWriteResult = {
  error:
    "Keeper.sh could not read the guest list on the source event, so it did not write to it.",
  refused: "event_has_attendees",
  success: false,
};

/*
 * Who a write would reach besides the user. "Nobody else" is the only answer that lets it
 * through, and it is an answer about the event, never about the account: an entry that
 * names the organizer names the person already holding the event, so an event whose only
 * ATTENDEE is its own ORGANIZER notifies no one. Reading it that way needs no address for
 * the account, which is what lets a CalDAV server that signs the user in by a bare username
 * answer the same as the other two.
 */
type SourceEventAudience = "no_one_else" | "others" | "unreadable";

/*
 * The one refusal on this path that is irreversible for somebody other than the user:
 * moving or cancelling a meeting mails everyone invited, and no answer afterwards recalls
 * that. Every other write is the user's own data and the provider's grant is what decides
 * it — the server already answered whether this account may write here, and every native
 * client acts on that answer.
 *
 * It is decided on the guest list the writer can see, and it deliberately does not ask who
 * the account is. A CalDAV server that signs the user in by a bare username gives no
 * address to weigh anything against, so that question has no answer there — and a question
 * that cannot be answered must never itself become a refusal, which is what withheld
 * two-way sync from those servers entirely.
 *
 * "Unreadable" is a different thing from an unidentifiable account and is refused: an event
 * whose guest list the writer could not follow — an ICS whose sub-component never closes, a
 * representation the provider itself marks as partial — may carry guests, and destroying it
 * mails them. The rule is stated once so the three providers cannot drift apart under it.
 */
const refuseWhenOthersAreInvited = (
  event: { audience: SourceEventAudience },
): SourceWriteResult | null => {
  switch (event.audience) {
    case "no_one_else": {
      return null;
    }
    case "others": {
      return ATTENDEE_REFUSAL;
    }
    default: {
      return UNREADABLE_ATTENDEE_REFUSAL;
    }
  }
};

/*
 * Every provider reports its guest list differently and none of them reports it as an
 * address the account can be recognised by, so each writer normalises to plain addresses
 * and the decision itself is made here, once.
 */
const MAILTO_PREFIX = /^mailto:/u;
const NO_OTHER_GUESTS = 0;

const normalizeAttendeeAddress = (address: string | null | undefined): string =>
  (address ?? "").trim().toLowerCase().replace(MAILTO_PREFIX, "");

const resolveAudience = (input: {
  attendees: readonly { address?: string | null; isAccount?: boolean }[];
  organizer: string | null | undefined;
}): SourceEventAudience => {
  const organizer = normalizeAttendeeAddress(input.organizer);
  const others = input.attendees.filter((attendee) => {
    if (attendee.isAccount === true) {
      return false;
    }
    const address = normalizeAttendeeAddress(attendee.address);
    return address === "" || address !== organizer;
  });
  if (others.length > NO_OTHER_GUESTS) {
    return "others";
  }
  return "no_one_else";
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
  attemptSourceWrite,
  isRetryableWriteStatus,
  normalizeAttendeeAddress,
  refuseWhenOthersAreInvited,
  resolveAudience,
  RICH_BODY_REFUSAL,
  toTransportWriteFailure,
  toWriteFailure,
};
export type {
  CalendarSourceWriter,
  SourceEventAudience,
  SourceEventUpdate,
  SourceWriteRefusal,
  SourceWriteResult,
};
