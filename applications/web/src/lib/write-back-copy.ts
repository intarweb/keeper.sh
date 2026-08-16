import { isWriteBackCapableSource } from "@keeper.sh/data-schemas";

/*
 * A calendar added by link is a read-only subscription, and one shared with the user
 * read-only carries "pull" alone: Keeper.sh can copy events out of either and has nowhere
 * to write them back to. The API refuses two-way on both against the same rule, so the
 * dashboard refuses them in the same terms rather than offering a control whose only
 * effect is a rejected request and a button that springs back.
 */
const supportsWriteBack = (
  source: {
    calendarType: string;
    capabilities: readonly string[];
    writeBackIdentity?: string | null;
  } | null,
): boolean => isWriteBackCapableSource(source);

const UNWRITABLE_SOURCE_COPY =
  "This calendar is one you subscribed to by link, so Keeper.sh can only read it."
  + " Two-way sync needs a calendar it can write to.";

const READ_ONLY_SOURCE_COPY =
  "This calendar is shared with you without permission to change it, so Keeper.sh can"
  + " only read it. Two-way sync needs a calendar it can write to.";

/*
 * Two-way sync will not rewrite or delete an event somebody else organized, and the only
 * thing it can weigh an event's organizer against is an address the account is known by.
 * A CalDAV account is stored without an email, so the login stands in for it — and a
 * server that signs the user in by username gives Keeper.sh no address at all. Offering
 * the mode there means refusing the user's own events one at a time.
 */
const UNIDENTIFIED_SOURCE_COPY =
  "Keeper.sh signs in to this calendar with a username rather than an email address, so it"
  + " cannot tell which events on it you created. Two-way sync will not change or delete an"
  + " event somebody else made, so it is not offered here.";

const LINK_SOURCE_CALENDAR_TYPE = "ical";
const IDENTIFIED_BY_LOGIN_CALENDAR_TYPE = "caldav";

/*
 * The three ways a source can be unwritable read differently to the person holding it: a
 * subscription they added, a calendar someone else owns, and a server that never told
 * Keeper.sh who they are. Naming the wrong one sends them looking for a setting that is
 * not theirs to change.
 */
const resolveUnwritableSourceCopy = (
  source: {
    calendarType: string;
    capabilities: readonly string[];
    writeBackIdentity?: string | null;
  } | null,
): string => {
  if (source?.calendarType === LINK_SOURCE_CALENDAR_TYPE) {
    return UNWRITABLE_SOURCE_COPY;
  }
  if (
    source?.calendarType === IDENTIFIED_BY_LOGIN_CALENDAR_TYPE
    && !source.writeBackIdentity?.includes("@")
  ) {
    return UNIDENTIFIED_SOURCE_COPY;
  }
  return READ_ONLY_SOURCE_COPY;
};

/*
 * A pair waiting on an answer about copies that vanished keeps its mode, so the control
 * goes on showing two-way as selected. It writes nothing back in the meantime and holds
 * every copy exactly where it is, for the whole connection and not only for the events the
 * question is about. Naming only the copies that vanished would leave the user editing the
 * rest in the belief those edits reach the original.
 */
const HELD_WHILE_WAITING =
  " Until you answer, two-way sync to {destination} is paused: changes you make to copies"
  + " are not written back to {source}, and the copies are left as they are.";

const WRITE_BACK_STATE_COPY: Record<string, string> = {
  all_copies_missing:
    "Every copy on {destination} is gone. Keeper.sh has not deleted the originals on"
    + " {source} and is waiting for you to say what happened."
    + HELD_WHILE_WAITING,
  delete_breaker_tripped:
    "A large number of copies on {destination} disappeared at once, so Keeper.sh did not"
    + " delete the originals on {source} and is waiting for you to say what happened."
    + HELD_WHILE_WAITING,
  delete_probe_blocked:
    "Keeper.sh was asked to delete originals on {source}, but it can still see the copies"
    + " on {destination}. Nothing was deleted and Keeper.sh is waiting for you to say what"
    + " happened."
    + HELD_WHILE_WAITING,
  delete_daily_cap:
    "Two-way sync to {destination} is paused: more originals on {source} were being"
    + " deleted in a day than Keeper.sh will apply unattended. The copies go back to"
    + " matching {source}.",
  bulk_edit_breaker:
    "Copies on {destination} changed all at once, which reads as something moving the whole"
    + " calendar rather than as edits you made. Keeper.sh did not rewrite the originals on"
    + " {source} and paused two-way sync; the copies go back to matching {source}.",
  plan_downgraded: "Two-way sync to {destination} is paused because the plan changed, so"
    + " the copies go back to matching {source}. Pick the two-way option again to restart it.",
  source_event_authored_by_someone_else:
    "A copy on {destination} was changed, but the original on {source} was created by"
    + " somebody else on a calendar shared with you. Keeper.sh will not rewrite or delete"
    + " another person's event, so two-way sync to {destination} is paused and nothing on"
    + " {source} was touched. The change on the copy is not kept: the copies go back to"
    + " matching {source}.",
  source_event_rich_body:
    "A copy on {destination} was changed, but the original on {source} has a formatted description — links, styling, or a meeting join block. Keeper.sh only ever reads it as plain text, so writing the change back would flatten it. Nothing on {source} was touched and two-way sync to {destination} is paused. The change on the copy is not kept: the copies go back to matching {source}.",
  source_event_has_attendees:
    "A copy on {destination} was changed, but the original on {source} is a meeting other"
    + " people are invited to. Keeper.sh will not cancel or move a meeting on their behalf,"
    + " so two-way sync to {destination} is paused and nothing on {source} was touched. The"
    + " change on the copy is not kept: the copies go back to matching {source}.",
  source_write_refused:
    "A copy on {destination} was changed, but {source} refused the change to the original."
    + " Nothing on {source} was touched and two-way sync to {destination} is paused. The"
    + " change on the copy is not kept: the copies go back to matching {source}.",
  runaway_write_back:
    "Two-way sync to {destination} is paused: the copies kept changing on their own, so"
    + " Keeper.sh stopped writing to {source}. The copies go back to matching {source}.",
  write_back_failing:
    "Keeper.sh could not write recent changes back to {source}, so two-way sync to"
    + " {destination} is paused. The changes made on the copies are not kept: the copies go"
    + " back to matching {source}.",
};

export {
  READ_ONLY_SOURCE_COPY,
  resolveUnwritableSourceCopy,
  supportsWriteBack,
  UNIDENTIFIED_SOURCE_COPY,
  UNWRITABLE_SOURCE_COPY,
  WRITE_BACK_STATE_COPY,
};
