import { describe, expect, it } from "vitest";

import { passkeyManagementUrl } from "@/features/settings/web-management-url";

describe("passkey management URL", () => {
  it("uses the configured hosted origin", () => {
    expect(passkeyManagementUrl("https://keeper.sh")).toBe(
      "https://keeper.sh/dashboard/settings/passkeys",
    );
  });

  it("uses a configured self-hosted origin without preserving an unsafe path", () => {
    expect(
      passkeyManagementUrl("https://calendar.example.test/tenant?ignored=yes"),
    ).toBe("https://calendar.example.test/dashboard/settings/passkeys");
  });

  it("rejects non-HTTPS management origins", () => {
    expect(() => passkeyManagementUrl("http://calendar.example.test")).toThrow(
      "HTTPS",
    );
  });
});
