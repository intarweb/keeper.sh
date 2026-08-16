const DELETE_PROBE_BLOCKED_REASON = "delete_probe_blocked";

const DELETE_CONFIRMATION_NOT_APPLICABLE_MESSAGE =
  "The copies are still on the destination calendar, so the originals cannot be deleted";

/*
 * Approving deletions is an answer to one question: whether copies Keeper.sh can no longer
 * see were really removed. A pair paused because the per-event probe keeps finding the
 * copies present is not asking that. Approving there deletes originals whose copies exist,
 * and the approval also exempts the pair from the bulk-delete breaker for half an hour, so
 * it is refused rather than recorded.
 */
const isDeleteApprovalApplicable = (pauseReason: string | null): boolean =>
  pauseReason !== DELETE_PROBE_BLOCKED_REASON;

export {
  DELETE_CONFIRMATION_NOT_APPLICABLE_MESSAGE,
  DELETE_PROBE_BLOCKED_REASON,
  isDeleteApprovalApplicable,
};
