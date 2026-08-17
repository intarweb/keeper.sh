import { describe, expect, it } from "vitest";

import { resolveOAuthTicketDestination } from "@/auth/oauth-return";

const base = { expiresAt: Date.now() + 60_000, provider: "google" } as const;

describe("OAuth ticket resume", () => {
  it("resumes successful source setup using the resource id", () => {
    expect(
      resolveOAuthTicketDestination({
        ...base,
        flow: "source",
        resourceId: "account/1",
        status: "success",
      }),
    ).toBe("/account/account%2F1/setup");
  });

  it("uses the caller fallback for destination completion", () => {
    expect(
      resolveOAuthTicketDestination(
        {
          ...base,
          flow: "destination",
          resourceId: "destination-1",
          status: "success",
        },
        "/(tabs)/today/sync-control",
      ),
    ).toBe("/(tabs)/today/sync-control");
  });

  it("does not resume cancelled or failed tickets", () => {
    expect(() =>
      resolveOAuthTicketDestination({
        ...base,
        flow: "source",
        status: "cancelled",
      }),
    ).toThrow("cancelled");
    expect(() =>
      resolveOAuthTicketDestination({
        ...base,
        flow: "source",
        status: "error",
        errorCode: "provider_denied",
      }),
    ).toThrow("provider_denied");
  });
});
