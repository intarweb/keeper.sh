import { describe, expect, it } from "vitest";

import { resolveNotificationPath } from "@/notifications/notification-routing";

describe("notification routing", () => {
  it("maps the versioned worker payload contract to allowlisted mobile routes", () => {
    expect(
      resolveNotificationPath({
        notificationType: "reauthentication_required",
        schemaVersion: 1,
        deepLink: {
          version: 1,
          path: "/accounts/[id]",
          params: { id: "account_1" },
        },
      }),
    ).toBe("/account/account_1");
    expect(
      resolveNotificationPath({
        notificationType: "calendar_invite",
        deepLink: {
          path: "/invitations",
          params: { calendarId: "calendar-1" },
        },
      }),
    ).toBe("/(tabs)/today/invitations");
    expect(
      resolveNotificationPath({
        notificationType: "sync_failed",
        deepLink: { path: "/calendar", params: { calendarId: "calendar-1" } },
      }),
    ).toBe("/calendar/calendar-1");
  });

  it("fails closed for unknown types, routes, or schema versions", () => {
    expect(
      resolveNotificationPath({
        notificationType: "marketing",
        deepLink: { path: "/accounts" },
      }),
    ).toBeNull();
    expect(
      resolveNotificationPath({
        notificationType: "sync_failed",
        schemaVersion: 2,
        deepLink: { path: "/calendar", params: { calendarId: "calendar-1" } },
      }),
    ).toBeNull();
    expect(
      resolveNotificationPath({
        notificationType: "sync_failed",
        deepLink: { path: "https://evil.example", params: {} },
      }),
    ).toBeNull();
  });

  it("rejects path injection and malformed parameters", () => {
    expect(
      resolveNotificationPath({
        notificationType: "sync_failed",
        deepLink: {
          path: "/calendar",
          params: { calendarId: "../../settings" },
        },
      }),
    ).toBeNull();
    expect(
      resolveNotificationPath({
        notificationType: "sync_failed",
        deepLink: { path: "/calendar", params: { calendarId: 12 } },
      }),
    ).toBeNull();
    expect(
      resolveNotificationPath({
        notificationType: "sync_failed",
        deepLink: { path: "/calendar", params: [] },
      }),
    ).toBeNull();
  });
});
