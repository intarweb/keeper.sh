import { describe, expect, it } from "vitest";
import {
  isUnauthenticatedRequest,
  processAuthResponse,
} from "@/handlers/auth-response";

describe("native session cookie transport", () => {
  it("recognizes Better Auth cookies supplied by SecureStore", () => {
    const request = new Request("https://api.keeper.sh/api/accounts", {
      headers: { cookie: "better-auth.session_token=native-session.signature" },
    });
    expect(isUnauthenticatedRequest(request)).toBe(false);
  });

  it("preserves the session cookie and adds only the browser companion marker", async () => {
    const response = Response.json({ user: { id: "user-1" } });
    response.headers.append(
      "Set-Cookie",
      "better-auth.session_token=native-session.signature; Path=/; HttpOnly; Secure; SameSite=None",
    );
    const processed = await processAuthResponse("/api/auth/sign-in/email", response);
    const cookies = processed.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.includes("native-session.signature"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("keeper.has_session=1"))).toBe(true);
  });

  it("clears stale native session cookies when get-session is null", async () => {
    const processed = await processAuthResponse(
      "/api/auth/get-session",
      Response.json(null),
    );
    expect(processed.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringContaining("better-auth.session_token=;"),
      expect.stringContaining("better-auth.session_data=;"),
    ]));
  });
});
