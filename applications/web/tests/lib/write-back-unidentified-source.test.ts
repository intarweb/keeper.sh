import { describe, expect, it } from "vitest";
import {
  READ_ONLY_SOURCE_COPY,
  resolveUnwritableSourceCopy,
  supportsWriteBack,
  UNIDENTIFIED_SOURCE_COPY,
} from "@/lib/write-back-copy";

const WRITABLE = ["pull", "push"];

/*
 * Nothing in the CalDAV connect flow asks for an email, so the login is the only address
 * the account is known by. On Nextcloud, Radicale, Baikal, Synology or Zimbra it is a bare
 * username, and the authorship guard then refuses every event carrying an ORGANIZER — the
 * user's own included — quarantining the pair on the first one and rebuilding the edit
 * that triggered it away. The API refuses the mode for exactly that reason, so the
 * dashboard has to refuse it in the same terms rather than offer a button that springs back.
 */
describe("a CalDAV source whose login is not an address", () => {
  it("is not offered two-way sync", () => {
    expect(supportsWriteBack({
      calendarType: "caldav",
      capabilities: WRITABLE,
      writeBackIdentity: "nextcloud-admin",
    })).toBe(false);
  });

  it("is offered two-way sync when the login is an address", () => {
    expect(supportsWriteBack({
      calendarType: "caldav",
      capabilities: WRITABLE,
      writeBackIdentity: "me@fastmail.com",
    })).toBe(true);
  });

  it("says the sign-in names no address rather than blaming a share", () => {
    const copy = resolveUnwritableSourceCopy({
      calendarType: "caldav",
      capabilities: WRITABLE,
      writeBackIdentity: "nextcloud-admin",
    });

    expect(copy).toBe(UNIDENTIFIED_SOURCE_COPY);
    expect(copy).not.toBe(READ_ONLY_SOURCE_COPY);
  });

  it("still blames the share for a CalDAV calendar it may only read", () => {
    expect(resolveUnwritableSourceCopy({
      calendarType: "caldav",
      capabilities: ["pull"],
      writeBackIdentity: "me@fastmail.com",
    })).toBe(READ_ONLY_SOURCE_COPY);
  });
});
