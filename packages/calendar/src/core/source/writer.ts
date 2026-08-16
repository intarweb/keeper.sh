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
  success: boolean;
}

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

export { ATTENDEE_REFUSAL, AUTHORSHIP_REFUSAL, RICH_BODY_REFUSAL };
export type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteRefusal,
  SourceWriteResult,
};
