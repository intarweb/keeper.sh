import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WRITE_BACK_STATE_COPY } from "@/lib/write-back-copy";

const PAGE = readFileSync(
  join(import.meta.dirname, "../../src/content/docs/two-way-sync.mdx"),
  "utf8",
);

/*
 * The page a user reads before switching two-way sync on is the whole of what they know
 * about it, and the sentence they act on is the one that says what is never touched. A
 * promise with no refusal behind it is worse than no promise: it is what sends somebody to
 * point "Two-way, including deletions" at a team calendar, where deleting a copy would
 * destroy a colleague's real event with no undo and no rebuild.
 */
describe("the two-way sync page and the writer agree about authorship", () => {
  it("promises an event somebody else created is never touched", () => {
    expect(PAGE).toContain("An event created by somebody else on a calendar shared with you");
  });

  it("has a stated pause for the promise, so the refusal can reach the user", () => {
    expect(WRITE_BACK_STATE_COPY.source_event_authored_by_someone_else)
      .toContain("created by somebody else");
  });

  /*
   * The CalDAV logins that carry no address are the one place the question has no answer.
   * The page used to give that as the reason those accounts are refused two-way sync; they
   * are offered it, so the page has to say what is and is not checked there instead.
   */
  it("does not claim a CalDAV account without an address is refused two-way sync", () => {
    expect(PAGE).not.toContain("is also refused");
  });

  it("says where the authorship check cannot run", () => {
    expect(PAGE).toContain("that check cannot run");
  });
});
