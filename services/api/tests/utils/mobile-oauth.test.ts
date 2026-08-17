import { describe, expect, it } from "vitest";
import { createNativeOAuthCoordinator } from "@/utils/mobile-oauth";
import type { OneTimeStore } from "@/utils/mobile-oauth";

const createStore = (): OneTimeStore => {
  const values = new Map<string, string>();
  return {
    consume(key) {
      const value = values.get(key) ?? null;
      values.delete(key);
      return Promise.resolve(value);
    },
    set(key, value) {
      values.set(key, value);
      return Promise.resolve();
    },
  };
};

const createCoordinator = (now = 1000) => createNativeOAuthCoordinator({
  now: () => now,
  secret: "test-secret-that-is-not-used-in-production",
  store: createStore(),
  trustedOrigins: ["keeper://", "https://mobile.keeper.sh"],
});

describe("native OAuth coordinator", () => {
  it("allows an allowlisted return and consumes callback context once", async () => {
    const coordinator = createCoordinator();
    const context = {
      flow: "source" as const,
      provider: "google",
      returnUrl: "keeper://oauth/callback",
      sessionId: "session-1",
      userId: "user-1",
    };
    await coordinator.registerContext("provider-state", context);
    await expect(coordinator.consumeContext("provider-state")).resolves.toEqual(context);
    await expect(coordinator.consumeContext("provider-state")).resolves.toBeNull();
  });

  it("rejects an untrusted return URL", async () => {
    const coordinator = createCoordinator();
    await expect(coordinator.registerContext("state", {
      flow: "destination",
      provider: "outlook",
      returnUrl: "https://keeper.sh.evil.test/oauth",
      sessionId: "session-1",
      userId: "user-1",
    })).rejects.toThrow("not allowlisted");
  });

  it("binds a signed ticket to the initiating user and session and prevents replay", async () => {
    const coordinator = createCoordinator();
    const ticket = await coordinator.issueTicket({
      flow: "destination",
      provider: "google",
      resourceId: "account-1",
      sessionId: "session-1",
      status: "success",
      userId: "user-1",
    });

    await expect(coordinator.redeemTicket(ticket, {
      sessionId: "other-session",
      userId: "user-1",
    })).resolves.toBeNull();
    await expect(coordinator.redeemTicket(ticket, {
      sessionId: "session-1",
      userId: "user-1",
    })).resolves.toBeNull();
  });

  it("returns no credentials and rejects tampered ticket signatures", async () => {
    const coordinator = createCoordinator();
    const ticket = await coordinator.issueTicket({
      flow: "source",
      provider: "google",
      resourceId: "account-1",
      sessionId: "session-1",
      status: "success",
      userId: "user-1",
    });
    const tampered = `${ticket.slice(0, -1)}x`;
    await expect(coordinator.redeemTicket(tampered, {
      sessionId: "session-1",
      userId: "user-1",
    })).resolves.toBeNull();

    const result = await coordinator.redeemTicket(ticket, {
      sessionId: "session-1",
      userId: "user-1",
    });
    expect(result).toMatchObject({ resourceId: "account-1", status: "success" });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("refreshToken");
  });
});
