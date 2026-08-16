const DELETE_PROBE_BLOCKED_REASON = "delete_probe_blocked";
const DELETE_CONFIRMATION_STATE = "delete_confirmation_required";

const DELETE_CONFIRMATION_NOT_APPLICABLE_MESSAGE =
  "The copies are still on the destination calendar, so the originals cannot be deleted";

const NO_DELETE_CONFIRMATION_PENDING_MESSAGE =
  "Keeper.sh is not waiting on an answer about deleted copies for this pair";

/*
 * Approving deletions is an answer to one question: whether copies Keeper.sh can no longer
 * see were really removed. A pair paused because the per-event probe keeps finding the
 * copies present is not asking that. Approving there deletes originals whose copies exist,
 * and the approval also exempts the pair from the bulk-delete breaker for half an hour, so
 * it is refused rather than recorded.
 */
const isDeleteApprovalApplicable = (pauseReason: string | null): boolean =>
  pauseReason !== DELETE_PROBE_BLOCKED_REASON;

type ConfirmationDisposition =
  | "approve"
  | "decline"
  | "ignore"
  | "not_applicable"
  | "not_pending";

/*
 * A pair that is not asking has no answer to record. Stamping the approval anyway arms a
 * half-hour exemption from the bulk-delete breaker and from the hold on an ambiguous empty
 * read, so a stray click — a double submit, a second tab, a client retry — leaves real
 * source events unprotected against the next truncated listing. Clearing the state anyway
 * is just as wrong in the other direction: a quarantine is a safety stop, not a question,
 * and lifting it resumes writing to a real calendar the pass had decided it could not
 * trust. Neither decision touches a pair that is not waiting on one.
 */
const resolveConfirmationDisposition = (
  decision: string,
  pending: { writeBackState: string; writeBackStateReason: string | null },
): ConfirmationDisposition => {
  const approving = decision === "apply";
  if (pending.writeBackState !== DELETE_CONFIRMATION_STATE) {
    if (approving) {
      return "not_pending";
    }
    return "ignore";
  }
  if (!approving) {
    return "decline";
  }
  if (!isDeleteApprovalApplicable(pending.writeBackStateReason)) {
    return "not_applicable";
  }
  return "approve";
};

export {
  DELETE_CONFIRMATION_NOT_APPLICABLE_MESSAGE,
  DELETE_CONFIRMATION_STATE,
  DELETE_PROBE_BLOCKED_REASON,
  isDeleteApprovalApplicable,
  NO_DELETE_CONFIRMATION_PENDING_MESSAGE,
  resolveConfirmationDisposition,
};
export type { ConfirmationDisposition };
