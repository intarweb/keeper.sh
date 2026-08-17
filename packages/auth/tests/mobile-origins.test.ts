import { describe, expect, it } from "vitest";
import {
  isAllowedMobileReturnUrl,
  parseMobileTrustedOrigins,
} from "../src/mobile-origins";

describe("mobile trusted origins", () => {
  it("defaults safely to the production Keeper deep-link scheme", () => {
    expect(parseMobileTrustedOrigins()).toEqual(["keeper://"]);
  });

  it("accepts the Keeper scheme and HTTPS associated-link origins", () => {
    expect(parseMobileTrustedOrigins("keeper://, https://app.keeper.sh"))
      .toEqual(["keeper://", "https://app.keeper.sh"]);
  });

  it.each([
    "http://keeper.sh",
    "https://keeper.sh/path",
    "https://keeper.sh:8443",
    "keeper://*",
    `${"java"}script:alert(1)`,
  ])("rejects unsafe origin %s", (origin) => {
    expect(() => parseMobileTrustedOrigins(origin)).toThrow();
  });

  it("allows only configured deep-link schemes and associated-link hosts", () => {
    const origins = ["keeper://", "https://app.keeper.sh"];
    expect(isAllowedMobileReturnUrl("keeper://oauth/callback", origins)).toBe(true);
    expect(isAllowedMobileReturnUrl("https://app.keeper.sh/open/oauth/callback", origins)).toBe(true);
    expect(isAllowedMobileReturnUrl("https://app.keeper.sh.evil.test/open/oauth/callback", origins)).toBe(false);
    expect(isAllowedMobileReturnUrl("keeper://settings", origins)).toBe(false);
    expect(isAllowedMobileReturnUrl("keeper://oauth/callback?next=https://evil.test", origins)).toBe(false);
    expect(isAllowedMobileReturnUrl(`${"java"}script:alert(1)`, origins)).toBe(false);
  });
});
