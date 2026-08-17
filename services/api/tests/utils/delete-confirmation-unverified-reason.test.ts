import { describe, expect, it } from "vitest";
import {
  DELETE_CONFIRMATION_NOT_APPLICABLE_MESSAGE,
  describeNotApplicable,
  isDeleteApprovalApplicable,
  resolveConfirmationDisposition,
} from "@/utils/delete-confirmation-policy";

/*
 * The dashboard withholding a button is not a gate, so the refusal has to hold here too. A
 * deletion held because Keeper.sh could not read the destination at all, or because the
 * original changed on the source before the deletion could be applied, never established
 * that the copies were removed. Approving there destroys real source events on evidence
 * that was never gathered, and it also exempts the pair from the bulk-delete breaker for
 * half an hour.
 */
const UNVERIFIED_REASONS = ["delete_probe_unreachable", "delete_source_changed"];

const pendingOn = (reason: string) => ({
  decision: "apply",
  deletesUnlocked: false,
  destinationReachable: true,
  writeBackState: "delete_confirmation_required",
  writeBackStateReason: reason,
});

describe("approving deletions is refused for a hold that saw nothing", () => {
  it.each(UNVERIFIED_REASONS)("refuses the approval for %s", (reason) => {
    expect(isDeleteApprovalApplicable(reason)).toBe(false);
    expect(resolveConfirmationDisposition("apply", pendingOn(reason))).toBe("not_applicable");
  });

  /*
   * And it says why in the words of what happened. The stock refusal states the copies are
   * still on the destination, which is the one thing neither of these holds observed.
   */
  it.each(UNVERIFIED_REASONS)("does not claim the copies were seen for %s", (reason) => {
    expect(describeNotApplicable(pendingOn(reason))).not.toBe(
      DELETE_CONFIRMATION_NOT_APPLICABLE_MESSAGE,
    );
  });

  it("still lets a pair decline", () => {
    expect(resolveConfirmationDisposition("decline", pendingOn("delete_probe_unreachable")))
      .toBe("decline");
  });
});
