import { describeWriteBackFields } from "@keeper.sh/data-schemas";
import type { WriteBackFieldExclusions } from "@keeper.sh/data-schemas";

const SINGLE_FIELD = 1;
const NO_FIELDS = 0;
const LAST_INDEX = -1;

const formatFieldList = (fields: string[]): string => {
  const [last] = fields.slice(LAST_INDEX);
  if (typeof last !== "string" || fields.length === SINGLE_FIELD) {
    return fields.join("");
  }
  return `${fields.slice(NO_FIELDS, LAST_INDEX).join(", ")} and ${last}`;
};

const resolveHiddenFields = (exclusions: WriteBackFieldExclusions): string[] => {
  const hidden: string[] = [];
  if (exclusions.excludeEventName) {
    hidden.push("title");
  }
  if (exclusions.excludeEventDescription) {
    hidden.push("description");
  }
  if (exclusions.excludeEventLocation) {
    hidden.push("location");
  }
  return hidden;
};

const resolveHiddenSentence = (hidden: string[]): string | null => {
  if (hidden.length === NO_FIELDS) {
    return null;
  }
  return `Their ${formatFieldList(hidden)} is hidden on copies, so it is never written back.`;
};

/*
 * The written list is derived from the same function the payload is built from, so a field
 * the pass can write to a real calendar can never be one this sentence leaves out. Naming
 * the hidden fields beside it is what stops the two halves reading as the same list.
 */
/*
 * An edit to a copy Keeper.sh has not yet observed is adopted as the baseline rather than
 * carried anywhere: it is not written back to the original and it is not undone on the
 * copy, so the two calendars simply stay different. Describing that as a replacement would
 * warn about the one outcome that does not happen and hide the one that does.
 */
const resolveAdoptedSentence = (sourceName: string): string =>
  "An edit made to a copy Keeper.sh has not observed yet — just after two-way sync is"
  + " switched on, or in the first minute after Keeper.sh updates that copy — stays on the"
  + ` copy and is not written back to ${sourceName}. The two stay different until the`
  + " original changes again.";

/*
 * Both sides moving since the last push resolves source-wins: the copy is rebuilt from the
 * original and the edit made on the copy is gone. Saying which side wins is the only way a
 * user can tell that outcome apart from the edit having been written back.
 */
const resolveConflictSentence = (sourceName: string): string =>
  `If the original also changed since Keeper.sh last updated the copy, ${sourceName} wins:`
  + " the copy is rebuilt from the original and the edit made on the copy is replaced.";

const buildWriteBackFieldSummary = (
  exclusions: WriteBackFieldExclusions,
  sourceName: string,
): { adopted: string; conflict: string; hidden: string | null; written: string } => ({
  adopted: resolveAdoptedSentence(sourceName),
  conflict: resolveConflictSentence(sourceName),
  hidden: resolveHiddenSentence(resolveHiddenFields(exclusions)),
  written: `Editing a copy changes the original event on ${sourceName}: its `
    + `${formatFieldList(describeWriteBackFields(exclusions))}.`,
});

export { buildWriteBackFieldSummary, formatFieldList };
