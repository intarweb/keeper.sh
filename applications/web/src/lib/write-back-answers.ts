import type { WriteBackMode, WriteBackStatus } from "@/state/destination-ids";

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

const QUARANTINED_STATE = "quarantined";

type ModeSelection = "commit" | "confirm_deletions" | "ignore";

/*
 * A quarantined pair keeps the mode it was paused on, so the control renders that mode as
 * selected and an early return on "same mode" leaves the user pressing the only affordance
 * they have with nothing happening. Re-picking it is how a pause is answered. A pair
 * holding a question about copies that vanished is answered through the confirmation
 * instead: committing the mode there would clear the state the answer applies to without
 * the question ever being asked.
 */
const resolveModeSelection = (input: {
  locked: boolean;
  nextMode: WriteBackMode;
  selectedMode: WriteBackMode;
  status: WriteBackStatus | null;
}): ModeSelection => {
  if (input.locked && input.nextMode !== "off") {
    return "ignore";
  }
  const restartable = input.status?.state === QUARANTINED_STATE;
  if (input.nextMode === input.selectedMode && !restartable) {
    return "ignore";
  }
  if (input.nextMode === "edits_and_deletes") {
    return "confirm_deletions";
  }
  return "commit";
};

export { PROBE_BLOCKED_REASON, resolveDeleteConfirmationAnswers, resolveModeSelection };
export type { DeleteConfirmationAnswer, ModeSelection };
