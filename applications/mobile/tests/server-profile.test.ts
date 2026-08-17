import { describe, expect, it } from "vitest";

import {
  canonicalizeHostedServerUrl,
  normalizeServerUrl,
  profileIdForNormalizedUrl,
} from "@/storage/server-url";

describe("server profile normalization", () => {
  it("normalizes an HTTPS origin while retaining an explicit deployment path", () => {
    expect(normalizeServerUrl("https://keeper.example.com/team/")).toBe(
      "https://keeper.example.com/team",
    );
  });

  it("adds HTTPS when the scheme is omitted", () => {
    expect(normalizeServerUrl("keeper.example.com/")).toBe(
      "https://keeper.example.com",
    );
  });

  it("rejects insecure production origins", () => {
    expect(() => normalizeServerUrl("ftp://keeper.example.com")).toThrow(
      "HTTPS",
    );
  });

  it.each([
    "https://user:secret@keeper.example.com",
    "https://keeper.example.com/#fragment",
    "https://keeper.example.com/?tenant=ambiguous",
  ])("rejects ambiguous or credential-bearing URL %s", (url) => {
    expect(() => normalizeServerUrl(url)).toThrow();
  });

  it("isolates same-host deployment paths with stable profile IDs", () => {
    const first = profileIdForNormalizedUrl(
      "https://keeper.example.com/tenant-a",
    );
    const second = profileIdForNormalizedUrl(
      "https://keeper.example.com/tenant-b",
    );
    expect(first).not.toBe(second);
    expect(first).toBe(
      profileIdForNormalizedUrl("https://keeper.example.com/tenant-a/"),
    );
  });

  it("migrates the legacy Keeper apex origin to the canonical passkey RP", () => {
    expect(
      canonicalizeHostedServerUrl("https://keeper.sh", "https://www.keeper.sh"),
    ).toBe("https://www.keeper.sh");
  });

  it("does not rewrite the legacy Keeper origin in a custom branded build", () => {
    expect(
      canonicalizeHostedServerUrl(
        "https://keeper.sh",
        "https://calendar.example.com",
      ),
    ).toBe("https://keeper.sh");
  });
});
