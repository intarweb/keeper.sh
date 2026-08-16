import { describe, expect, it } from "vitest";
import {
  READ_ONLY_SOURCE_COPY,
  resolveUnwritableSourceCopy,
  supportsWriteBack,
  WRITE_BACK_STATE_COPY,
} from "@/lib/write-back-copy";

const WRITABLE = ["pull", "push"];

/*
 * Nothing in the CalDAV connect flow asks for an email, so on Nextcloud, Radicale, Baikal,
 * Synology and Zimbra the login is a bare username and there is no address to weigh an
 * ORGANIZER against. That was the whole reason two-way sync was withheld there — the
 * writer refused every event carrying one. The writer no longer asks who wrote the event,
 * so the mode has nothing left to withhold: this is the end-to-end proof that the fix is
 * reachable in production and not only inside the writer.
 */
describe("a CalDAV source whose login is not an address", () => {
  it("is offered two-way sync", () => {
    expect(supportsWriteBack({
      calendarType: "caldav",
      capabilities: WRITABLE,
      writeBackIdentity: "nextcloud-admin",
    })).toBe(true);
  });

  it("is offered two-way sync when the login is an address", () => {
    expect(supportsWriteBack({
      calendarType: "caldav",
      capabilities: WRITABLE,
      writeBackIdentity: "me@fastmail.com",
    })).toBe(true);
  });

  it("is offered two-way sync when nothing names the account at all", () => {
    expect(supportsWriteBack({
      calendarType: "caldav",
      capabilities: WRITABLE,
      writeBackIdentity: null,
    })).toBe(true);
  });

  it("still blames the share for a CalDAV calendar it may only read", () => {
    expect(resolveUnwritableSourceCopy({
      calendarType: "caldav",
      capabilities: ["pull"],
      writeBackIdentity: "nextcloud-admin",
    })).toBe(READ_ONLY_SOURCE_COPY);
  });

  /*
   * The mode is offered on an account that cannot name itself, and no write there is ever
   * refused over authorship — the question has no answer on those servers. The pause still
   * has to be explained, because the accounts that can answer it reach it: the docs promise
   * an event somebody else created is never touched, and a promise with no state behind it
   * is the one that gets a colleague's booking deleted.
   */
  it("explains the pause about who created the event", () => {
    expect(WRITE_BACK_STATE_COPY.source_event_authored_by_someone_else)
      .toContain("created by somebody else");
  });
});
