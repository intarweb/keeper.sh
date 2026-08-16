import type { WriteBackStatus } from "@/state/destination-ids";

type DeleteConfirmationAnswer = "apply" | "decline";

const DELETE_CONFIRMATION_STATE = "delete_confirmation_required";

/*
 * "Delete the originals" is an answer to one question only: whether copies Keeper.sh can no
 * longer see were really removed by the user. A pair paused because the destination keeps
 * reporting the copies as present is not asking that question — approving there would delete
 * originals whose copies exist, and the approval doubles as a half-hour exemption from the
 * bulk-delete breaker. That answer is not offered.
 */
const PROBE_BLOCKED_REASON = "delete_probe_blocked";

const resolveDeleteConfirmationAnswers = (
  status: WriteBackStatus | null,
): DeleteConfirmationAnswer[] => {
  if (!status || status.state !== DELETE_CONFIRMATION_STATE) {
    return [];
  }
  if (status.reason === PROBE_BLOCKED_REASON) {
    return ["decline"];
  }
  return ["apply", "decline"];
};

export { PROBE_BLOCKED_REASON, resolveDeleteConfirmationAnswers };
export type { DeleteConfirmationAnswer };
