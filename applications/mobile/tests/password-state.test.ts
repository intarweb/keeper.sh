import { describe, expect, it } from "vitest";

import { hasCredentialPassword } from "@/features/settings/password-state";

describe("per-user password state", () => {
  it("requires a credential account", () => {
    expect(
      hasCredentialPassword([
        { providerId: "google" },
        { providerId: "credential" },
      ]),
    ).toBe(true);
    expect(hasCredentialPassword([{ providerId: "google" }])).toBe(false);
  });

  it("fails closed for malformed account responses", () => {
    expect(hasCredentialPassword(null)).toBe(false);
    expect(hasCredentialPassword([{ providerId: 1 }, "credential"])).toBe(
      false,
    );
  });
});
