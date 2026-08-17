import { describe, expect, it } from "vitest";

import {
  cacheKindForPath,
  minimizeCacheValue,
  minimizeCacheValueForPath,
} from "@/offline/cache-policy";

describe("offline cache policy", () => {
  it("only caches bounded agenda and non-secret metadata routes", () => {
    expect(cacheKindForPath("/api/v1/events?start=1&end=2")).toBe("agenda");
    expect(cacheKindForPath("/api/accounts")).toBe("metadata");
    expect(cacheKindForPath("/api/ical/settings")).toBe("metadata");
  });

  it.each([
    "/api/ical/token",
    "/api/api-tokens",
    "/api/mobile/devices",
    "/api/v1/events/event-private",
  ])("does not cache sensitive or unbounded route %s", (path) => {
    expect(cacheKindForPath(path)).toBe("none");
  });

  it("minimizes agenda entries to the display-safe subset", () => {
    const [event] = minimizeCacheValue("agenda", [
      {
        id: "event-1",
        title: "Planning",
        startTime: "2026-08-14T10:00:00Z",
        endTime: "2026-08-14T10:30:00Z",
        description: "secret notes",
        location: "private room",
        calendarUrl: "https://provider.example/private",
      },
    ]) as Array<Record<string, unknown>>;
    expect(event).toMatchObject({ id: "event-1", title: "Planning" });
    expect(event).not.toHaveProperty("description");
    expect(event).not.toHaveProperty("location");
    expect(event).not.toHaveProperty("calendarUrl");
  });

  it("removes user identifiers from cached account metadata", () => {
    const [account] = minimizeCacheValueForPath("metadata", "/api/accounts", [
      {
        id: "account-1",
        accountLabel: "Work",
        provider: "google",
        providerName: "Google",
        email: "private@example.com",
        accountIdentifier: "private@example.com",
      },
    ]) as Array<Record<string, unknown>>;
    expect(account).toMatchObject({ id: "account-1", accountLabel: "Work" });
    expect(account).not.toHaveProperty("email");
    expect(account).not.toHaveProperty("accountIdentifier");
  });
});
