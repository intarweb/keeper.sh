import { describe, expect, it } from "vitest";

import { parseSecureCachedSession } from "@/auth/offline-session";

const now = new Date("2026-08-14T12:00:00.000Z").getTime();
const cached = JSON.stringify({
  user: {
    id: "user-1",
    name: "Rida",
    email: "rida@example.com",
    emailVerified: true,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  },
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(now + 60_000).toISOString(),
  },
});

describe("secure offline session restoration", () => {
  it("requires both Better Auth's cached session and a live persisted cookie", () => {
    expect(
      parseSecureCachedSession(cached, "better-auth.session_token=opaque", now)
        ?.user.id,
    ).toBe("user-1");
    expect(parseSecureCachedSession(cached, "", now)).toBeNull();
  });

  it("rejects expired and malformed cached state", () => {
    expect(
      parseSecureCachedSession(
        cached,
        "better-auth.session_token=opaque",
        now + 120_000,
      ),
    ).toBeNull();
    expect(
      parseSecureCachedSession(
        '{"user":{}}',
        "better-auth.session_token=opaque",
        now,
      ),
    ).toBeNull();
    expect(
      parseSecureCachedSession(
        "not-json",
        "better-auth.session_token=opaque",
        now,
      ),
    ).toBeNull();
  });
});
