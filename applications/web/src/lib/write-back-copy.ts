/*
 * A calendar added by link is a read-only subscription: Keeper.sh can copy events out of
 * it and has nowhere to write them back to. The API refuses two-way on it, so the
 * dashboard has to refuse it in the same terms rather than offering a control whose only
 * effect is a rejected request and a button that springs back.
 */
const UNWRITABLE_SOURCE_CALENDAR_TYPE = "ical";

const supportsWriteBack = (
  source: { calendarType: string; capabilities: readonly string[] } | null,
): boolean => {
  if (!source) {
    return false;
  }
  return source.calendarType !== UNWRITABLE_SOURCE_CALENDAR_TYPE
    && source.capabilities.includes("pull");
};

const UNWRITABLE_SOURCE_COPY =
  "This calendar is one you subscribed to by link, so Keeper.sh can only read it."
  + " Two-way sync needs a calendar it can write to.";

const WRITE_BACK_STATE_COPY: Record<string, string> = {
  all_copies_missing:
    "Every copy on {destination} is gone. Keeper.sh has not deleted the originals on"
    + " {source} and is waiting for you to say what happened.",
  delete_breaker_tripped:
    "A large number of copies on {destination} disappeared at once, so Keeper.sh did not"
    + " delete the originals on {source} and is waiting for you to say what happened.",
  delete_probe_blocked:
    "Keeper.sh was asked to delete originals on {source}, but it can still see the copies"
    + " on {destination}. Nothing was deleted.",
  delete_daily_cap:
    "Two-way sync to {destination} is paused: more originals on {source} were being"
    + " deleted in a day than Keeper.sh will apply unattended.",
  bulk_edit_breaker:
    "Copies on {destination} changed all at once, which reads as something moving the whole"
    + " calendar rather than as edits you made. Keeper.sh did not rewrite the originals on"
    + " {source} and paused two-way sync; the copies go back to matching {source}.",
  plan_downgraded: "Two-way sync to {destination} is paused because the plan changed."
    + " Pick the two-way option again to restart it.",
  source_event_authored_by_someone_else:
    "A copy on {destination} was changed, but the original on {source} was created by"
    + " somebody else on a calendar shared with you. Keeper.sh will not rewrite or delete"
    + " another person's event, so two-way sync to {destination} is paused and nothing on"
    + " {source} was touched.",
  source_event_rich_body:
    "A copy on {destination} was changed, but the original on {source} has a formatted description — links, styling, or a meeting join block. Keeper.sh only ever reads it as plain text, so writing the change back would flatten it. Nothing on {source} was touched and two-way sync to {destination} is paused.",
  source_event_has_attendees:
    "A copy on {destination} was changed, but the original on {source} is a meeting other"
    + " people are invited to. Keeper.sh will not cancel or move a meeting on their behalf,"
    + " so two-way sync to {destination} is paused and nothing on {source} was touched.",
  source_write_refused:
    "A copy on {destination} was changed, but {source} refused the change to the original."
    + " Nothing on {source} was touched and two-way sync to {destination} is paused.",
  runaway_write_back:
    "Two-way sync to {destination} is paused: the copies kept changing on their own, so"
    + " Keeper.sh stopped writing to {source}.",
  write_back_failing:
    "Keeper.sh could not write recent changes back to {source}, so two-way sync to"
    + " {destination} is paused.",
};

export { supportsWriteBack, UNWRITABLE_SOURCE_COPY, WRITE_BACK_STATE_COPY };
