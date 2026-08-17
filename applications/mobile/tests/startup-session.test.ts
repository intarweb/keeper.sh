import { describe, expect, it } from "vitest";

import type { UserSession } from "@/api/domain";
import {
  decideStartupSession,
  isExplicitUnauthorized,
  isTransportUnavailable,
} from "@/auth/startup-session";

const cached = {
  user: { id: "user-1" },
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: "2026-08-15T00:00:00.000Z",
  },
} as UserSession;

describe("cold-launch session decisions", () => {
  it("fails closed and refuses cached state for explicit unauthorized responses", () => {
    expect(isExplicitUnauthorized({ status: 401 })).toBe(true);
    expect(
      decideStartupSession(
        { error: { response: { status: 401 } }, kind: "error" },
        cached,
      ),
    ).toEqual({ kind: "unauthorized", session: null });
  });

  it("restores verified cached state only for transport unavailability", () => {
    expect(isTransportUnavailable({ code: "NETWORK_ERROR", status: 0 })).toBe(
      true,
    );
    expect(
      decideStartupSession(
        { error: new TypeError("Network request failed"), kind: "error" },
        cached,
      ),
    ).toEqual({ kind: "offline", session: cached });
    expect(
      decideStartupSession(
        { error: { message: "Server failed", status: 500 }, kind: "error" },
        cached,
      ),
    ).toEqual({
      error: { message: "Server failed", status: 500 },
      kind: "unavailable",
      session: null,
    });
  });

  it("treats a successful empty session as signed out, not offline", () => {
    expect(
      decideStartupSession({ kind: "success", session: null }, cached),
    ).toEqual({ kind: "signed-out", session: null });
  });
});
