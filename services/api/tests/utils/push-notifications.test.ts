import { describe, expect, it } from "vitest";
import { isNotificationEnabled } from "@/utils/notification-preferences";

describe("mobile notification preferences", () => {
  it("defaults all notification classes on for an existing user", () => {
    expect(isNotificationEnabled(globalThis.undefined, "calendar_invite")).toBe(true);
    expect(isNotificationEnabled(globalThis.undefined, "reauthentication_required")).toBe(true);
    expect(isNotificationEnabled(globalThis.undefined, "sync_failed")).toBe(true);
  });

  it("maps each event class to its independent preference", () => {
    const preferences = { invites: false, reauthentication: true, syncFailures: false };
    expect(isNotificationEnabled(preferences, "calendar_invite")).toBe(false);
    expect(isNotificationEnabled(preferences, "reauthentication_required")).toBe(true);
    expect(isNotificationEnabled(preferences, "sync_failed")).toBe(false);
  });
});
