import { describe, expect, it } from "vitest";
import {
  refuseWhenSomebodyElseAuthoredIt,
  resolveAuthorship,
} from "../../../src/core/source/writer";

const ACCOUNT = "me@example.com";
const COLLEAGUE = "colleague@example.com";

/*
 * The one refusal a mirror is allowed to make about ownership, and every way the question
 * can fail to have an answer. Only a provable "somebody else" refuses: the alternative is a
 * connection that pauses over a question nobody asked, and a user who learns to ignore the
 * banner that also carries the real one.
 */
describe("who created a source event", () => {
  it("is the account when the provider says so, whatever the addresses say", () => {
    expect(resolveAuthorship({ account: null, author: COLLEAGUE, isAccount: true }))
      .toBe("the_account");
  });

  it("is somebody else when both addresses are known and differ", () => {
    expect(resolveAuthorship({ account: ACCOUNT, author: COLLEAGUE })).toBe("someone_else");
  });

  it("reads a mailto author as the address inside it", () => {
    expect(resolveAuthorship({ account: ACCOUNT, author: `MAILTO:${ACCOUNT}` }))
      .toBe("the_account");
  });

  it("is unknown when the account has no address, as a CalDAV username login has none", () => {
    expect(resolveAuthorship({ account: null, author: COLLEAGUE })).toBe("unknown");
  });

  it("is unknown when the event names no author", () => {
    expect(resolveAuthorship({ account: ACCOUNT, author: null })).toBe("unknown");
  });

  /*
   * An OAuth sign-in that returns no address is stored under the display name it did
   * return. Weighing that against an author's address answers "somebody else" for every
   * event on the calendar, so the connection pauses the first time anything is edited.
   */
  it("is unknown when what stands in for the account is a name rather than an address", () => {
    expect(resolveAuthorship({ account: "John Smith", author: COLLEAGUE })).toBe("unknown");
  });

  it("refuses nothing it could not answer", () => {
    expect(refuseWhenSomebodyElseAuthoredIt({ authorship: "unknown" })).toBeNull();
    expect(refuseWhenSomebodyElseAuthoredIt({ authorship: "the_account" })).toBeNull();
    expect(refuseWhenSomebodyElseAuthoredIt({ authorship: "someone_else" })?.refused)
      .toBe("event_authored_by_someone_else");
  });
});
