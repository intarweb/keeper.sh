import { describe, expect, it } from "vitest";
import { redactUrlCredentials } from "../../src/utils/redact-url-credentials";

describe("redactUrlCredentials", () => {
  it("removes userinfo and fragments from URLs returned by read models", () => {
    expect(redactUrlCredentials("https://user:secret@example.com/calendar.ics#private"))
      .toBe("https://example.com/calendar.ics");
  });

  it("fails closed for invalid stored URLs", () => {
    expect(redactUrlCredentials("not a URL")).toBeNull();
  });
});
