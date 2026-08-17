import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WRITE_BACK_STATE_COPY } from "@/lib/write-back-copy";

const PAGE = readFileSync(
  join(import.meta.dirname, "../../src/content/docs/two-way-sync.mdx"),
  "utf8",
);

/*
 * The hold that stops the deletions and asks is raised on a reading that came back with
 * nothing at all — the reading that cannot be told from a broken connection. A reading that
 * carried the user's own events but none of the copies is a calendar Keeper.sh demonstrably
 * read, and those deletions go through on the usual evidence: the disappearance seen twice
 * over minutes, and the copy searched for directly before the original is touched. Stating
 * the hold as "none of the copies" promises an ask on a reading nobody is asked about, on
 * the one page a user reads before turning deletions on.
 */
describe("what the two-way sync page says the blank-read hold covers", () => {
  it("does not promise an ask whenever the copies are absent from a reading", () => {
    expect(PAGE).not.toContain("came back with none of the copies on it");
    expect(WRITE_BACK_STATE_COPY.all_copies_missing)
      .not.toContain("came back with none of the copies on it");
  });

  it("states the hold as the reading that came back with nothing at all", () => {
    expect(PAGE).toContain("came back with nothing on it at all");
    expect(WRITE_BACK_STATE_COPY.all_copies_missing)
      .toContain("came back with nothing on it at all");
  });

  it("still names the bulk disappearance as the case that is asked about", () => {
    expect(PAGE).toContain("More than 5 copies disappeared between two readings");
  });
});
