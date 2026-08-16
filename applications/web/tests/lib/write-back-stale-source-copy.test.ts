import { describe, expect, it } from "vitest";
import { resolveWriteBackStateCopy } from "@/lib/write-back-copy";
import { resolveDeleteConfirmationAnswers } from "@/lib/write-back-answers";

const HELD_ON_STALE_SOURCE = {
  deletesUnlocked: false,
  reason: "source_not_read_recently",
  state: "paused",
};

const FALLBACK = "Two-way sync to {destination} is paused.";

describe("the status line for a pair held because its source has gone stale", () => {
  it("says why rather than falling back to the bare pause", () => {
    const copy = resolveWriteBackStateCopy(HELD_ON_STALE_SOURCE, FALLBACK);

    expect(copy).not.toBe(FALLBACK);
    expect(copy).toContain("{source}");
    expect(copy).toContain("{destination}");
  });

  /*
   * The one pause where the copies are withheld from the one-way repair as well, so the
   * sentence every other pause carries would be a false promise here.
   */
  it("does not promise the copies go back to matching the source", () => {
    const copy = resolveWriteBackStateCopy(HELD_ON_STALE_SOURCE, FALLBACK);

    expect(copy).not.toContain("go back to matching");
  });

  it("asks the user for no answer, because there is none to give", () => {
    expect(resolveDeleteConfirmationAnswers(HELD_ON_STALE_SOURCE)).toEqual([]);
  });
});
