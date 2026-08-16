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
type SourceWriteRefusal = "event_has_attendees";

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

export { ATTENDEE_REFUSAL };
export type {
  CalendarSourceWriter,
  SourceEventUpdate,
  SourceWriteRefusal,
  SourceWriteResult,
};
