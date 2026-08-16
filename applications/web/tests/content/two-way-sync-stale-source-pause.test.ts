import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModeSelection } from "@/lib/write-back-answers";
import { WRITE_BACK_STATE_COPY } from "@/lib/write-back-copy";

const PAGE = readFileSync(
  join(import.meta.dirname, "../../src/content/docs/two-way-sync.mdx"),
  "utf8",
);

const HELD_ON_STALE_SOURCE = {
  deletesUnlocked: false,
  reason: "source_not_read_recently",
  state: "paused",
};

/*
 * The page is the account a user reads before they turn two-way sync on, and "When it
 * pauses" is where they learn what a pause costs them and how to end one. A pair held
 * because its source has not been read recently is a pause that does neither of the two
 * things that section states, and the dashboard's own sentence for it says so.
 */
describe("the two-way sync page and the hold on a source that has not been read", () => {
  it("does not promise that every pause rebuilds the copies", () => {
    expect(WRITE_BACK_STATE_COPY.source_not_read_recently)
      .toContain("the copies are left as they are");

    expect(PAGE).not.toContain(
      "In every paused state the copies go back to matching the original",
    );
  });

  it("does not promise that every pause is ended by picking the mode again", () => {
    expect(resolveModeSelection({
      locked: false,
      nextMode: "edits",
      selectedMode: "edits",
      status: HELD_ON_STALE_SOURCE,
      writableSource: true,
    })).toBe("ignore");

    expect(PAGE).not.toContain(
      "Switching it back on is a matter of picking the two-way option again.",
    );
  });

  it("names the one pause that ends by itself when the source is read again", () => {
    expect(PAGE).toMatch(/has not been able to read|not read .{0,20}recently/u);
  });
});
