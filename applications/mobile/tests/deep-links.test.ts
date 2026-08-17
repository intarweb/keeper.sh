import { describe, expect, it } from "vitest";

import {
  isSafeInternalPath,
  parseOAuthTicketParam,
  resolveOpenPath,
  resolveOpenRequest,
} from "@/navigation/deep-links";

describe("mobile deep links", () => {
  const allowedStaticRoutes = [
    "/(tabs)/today",
    "/(tabs)/today/activity",
    "/(tabs)/today/invitations",
    "/(tabs)/today/sync-control",
    "/(tabs)/calendars",
    "/(tabs)/calendars/connect",
    "/(tabs)/calendars/connect-provider",
    "/(tabs)/settings",
    "/(tabs)/settings/about",
    "/(tabs)/settings/api-tokens",
    "/(tabs)/settings/feedback",
    "/(tabs)/settings/ical",
    "/(tabs)/settings/notifications",
    "/(tabs)/settings/passkeys",
    "/(tabs)/settings/plan",
    "/(tabs)/settings/privacy",
    "/(tabs)/settings/profile",
    "/(tabs)/settings/report",
    "/(tabs)/settings/security",
    "/(tabs)/settings/server",
  ];

  it("maps opaque resource links to internal routes", () => {
    expect(resolveOpenPath(["event", "event_123"])).toBe("/event/event_123");
    expect(resolveOpenPath(["calendar", "calendar-1"])).toBe(
      "/calendar/calendar-1",
    );
    expect(resolveOpenPath(["invitation"])).toBe("/(tabs)/today/invitations");
    expect(resolveOpenPath(["reauthentication"])).toBe(
      "/(tabs)/today/sync-control",
    );
  });

  it("rejects external URLs and unknown routes", () => {
    expect(isSafeInternalPath("https://evil.example/path")).toBe(false);
    expect(isSafeInternalPath("//evil.example/path")).toBe(false);
    expect(resolveOpenPath(["https:", "evil.example"])).toBe("/(tabs)/today");
    expect(isSafeInternalPath("/(tabs)/settings/does-not-exist")).toBe(false);
    expect(isSafeInternalPath("/(tabs)/calendars/does-not-exist")).toBe(false);
  });

  it("allows every supported static and resource route", () => {
    for (const route of allowedStaticRoutes) {
      expect(isSafeInternalPath(route), route).toBe(true);
    }
    expect(isSafeInternalPath("/event/event_123")).toBe(true);
    expect(isSafeInternalPath("/calendar/calendar-1")).toBe(true);
    expect(isSafeInternalPath("/account/account-1")).toBe(true);
    expect(isSafeInternalPath("/account/account-1/setup")).toBe(true);
  });

  it("preserves an HTTPS associated-link OAuth ticket into the redemption route", () => {
    const ticket =
      "550e8400-e29b-41d4-a716-446655440000.1780000000000.signed_value";
    expect(resolveOpenRequest(["oauth", "callback"], ticket)).toEqual({
      destination: `/oauth/callback?ticket=${encodeURIComponent(ticket)}`,
      kind: "oauth",
    });
  });

  it("fails closed for missing, repeated, or invalid associated-link tickets", () => {
    expect(resolveOpenRequest(["oauth", "callback"], undefined).kind).toBe(
      "error",
    );
    expect(resolveOpenRequest(["oauth", "callback"], ["one", "two"]).kind).toBe(
      "error",
    );
    expect(resolveOpenRequest(["oauth", "callback"], "bad/ticket").kind).toBe(
      "error",
    );
    expect(parseOAuthTicketParam("x".repeat(1025))).toBeNull();
  });
});
