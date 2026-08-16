import { describe, expect, it } from "vitest";
import { resolveDeleteConfirmationAnswers } from "@/lib/write-back-answers";

const WAITING = "delete_confirmation_required";

/*
 * A blank read has two causes and the code cannot tell them apart: the copies were deleted,
 * or the connection, the calendar id or the provider is broken. "Delete the originals" is
 * only an answer to the first, and it authorises irreversible deletions on a real calendar,
 * so it is not offered while a blank read is the only evidence there is. What clears the
 * bar is a read that came back with at least one item after the copies went missing — that
 * proves the credential works AND that the calendar id still points at the right calendar,
 * which reconnecting on its own does not.
 */
describe("what a pair paused on a blank read can be answered with", () => {
  it("offers no way to delete originals on the strength of a blank read alone", () => {
    expect(resolveDeleteConfirmationAnswers({
      deletesUnlocked: false,
      reason: "all_copies_missing",
      state: WAITING,
    })).toEqual(["decline"]);
  });

  it("offers the deletion once a read has come back with something since", () => {
    expect(resolveDeleteConfirmationAnswers({
      deletesUnlocked: true,
      reason: "all_copies_missing",
      state: WAITING,
    })).toEqual(["apply", "decline"]);
  });

  /*
   * The escape hatch for a destination the user really did empty runs through this reason:
   * put the copies back, let one pass re-create and read them, then remove them again. That
   * removal is observed against a read that returned items, so it lands here rather than on
   * the blank-read path — which is exactly why this reason must not be gated too.
   */
  it("still offers the deletion for a breaker trip, gated or not", () => {
    expect(resolveDeleteConfirmationAnswers({
      deletesUnlocked: false,
      reason: "delete_breaker_tripped",
      state: WAITING,
    })).toEqual(["apply", "decline"]);
  });

  it("still refuses the deletion while the destination reports the copies present", () => {
    expect(resolveDeleteConfirmationAnswers({
      deletesUnlocked: true,
      reason: "delete_probe_blocked",
      state: WAITING,
    })).toEqual(["decline"]);
  });

  it("still offers nothing at all when the pair is not waiting on an answer", () => {
    expect(resolveDeleteConfirmationAnswers({
      deletesUnlocked: true,
      reason: "runaway_write_back",
      state: "quarantined",
    })).toEqual([]);
    expect(resolveDeleteConfirmationAnswers(null)).toEqual([]);
  });
});
