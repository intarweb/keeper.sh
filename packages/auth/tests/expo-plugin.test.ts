import { describe, expect, it } from "vitest";
import { createNativeAuthPlugin } from "../src";

describe("native auth server plugin", () => {
  it("registers Better Auth's Expo server transport", () => {
    expect(createNativeAuthPlugin().id).toBe("expo");
  });
});
