import { describe, expect, it } from "vitest";
import { resolveDeleteConfirmationAnswers } from "@/lib/write-back-answers";
import type { WriteBackStatus } from "@/state/destination-ids";

/*
 * "Delete the originals" says one thing: the copies Keeper.sh can no longer see really were
 * removed, go ahead and destroy the originals on the source. It answers a question the pass
 * asked on evidence it gathered. A pause raised because nobody could look at the destination
 * at all, or because the original moved out from under the deletion, rests on no such
 * evidence — the copies were never observed gone — so the destructive answer is not offered
 * there. Declining, which puts the copies back, always is.
 */
const UNVERIFIED_REASONS = ["delete_probe_unreachable", "delete_source_changed"];

const createStatus = (reason: string): WriteBackStatus => ({
  deletesUnlocked: false,
  reason,
  state: "delete_confirmation_required",
} as WriteBackStatus);

describe("a pause raised on evidence nobody gathered offers no destructive answer", () => {
  it.each(UNVERIFIED_REASONS)("offers only declining for %s", (reason) => {
    expect(resolveDeleteConfirmationAnswers(createStatus(reason))).toEqual(["decline"]);
  });
});
