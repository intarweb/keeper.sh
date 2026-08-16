import { conformanceHash } from "@keeper.sh/sync-conformance";
import { describe, expect, test } from "vitest";
import { clientStateHash, verifyClientState } from "../../src/push/secret";
import { filesMatching } from "../support/sources";

describe("the stored secret is a hash, and the comparison is constant time", () => {
  test("MS-P6: verification compares hashes, never the plaintext", async () => {
    const stored = clientStateHash("the-shared-secret", conformanceHash);
    const comparisons = await filesMatching("src/push", "timingSafeEqual");

    expect(stored).not.toContain("the-shared-secret");
    expect(verifyClientState("the-shared-secret", stored)).toBe(true);
    expect(verifyClientState("the-shared-secre", stored)).toBe(false);
    expect(verifyClientState("", stored)).toBe(false);
    expect(comparisons).toEqual(["src/push/secret.ts"]);
  });
});
