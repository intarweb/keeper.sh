import { describe, expect, it, vi } from "vitest";
import { GET as destinationCallback } from "../../../../src/routes/api/destinations/callback/[provider]";
import { GET as sourceCallback } from "../../../../src/routes/api/sources/callback/[provider]";

const nativeContext = {
  flow: "destination" as "destination" | "source",
  provider: "google",
  returnUrl: "keeper://oauth/callback",
  sessionId: "session-1",
  userId: "user-1",
};

vi.mock("../../../../src/utils/middleware", () => ({
  withWideEvent: (handler: unknown) => handler,
}));
vi.mock("../../../../src/context", () => ({ baseUrl: "https://keeper.sh" }));
vi.mock("../../../../src/utils/logging", () => ({
  widelog: { errorFields: vi.fn(), set: vi.fn() },
}));
vi.mock("../../../../src/utils/error-labelling", () => ({ labelFailure: vi.fn() }));
vi.mock("../../../../src/utils/request-query", () => ({
  oauthCallbackQuerySchema: { allows: () => true },
  providerParamSchema: { allows: () => true },
}));
vi.mock("../../../../src/utils/mobile-oauth-return", () => ({
  buildNativeOAuthResponse: (_context: unknown, input: { resourceId?: string; status: string }) =>
    Promise.resolve(new Response(null, {
      headers: {
        location: `keeper://oauth/callback?ticket=opaque&status=${input.status}&resourceId=${input.resourceId ?? ""}`,
      },
      status: 302,
    })),
  consumeNativeReturnContext: () => Promise.resolve(nativeContext),
  resolveNativeOAuthFailure: () => ({ errorCode: "oauth_failed", status: "error" }),
}));
vi.mock("../../../../src/utils/oauth", () => ({
  OAuthError: class OAuthError extends Error {
    redirectUrl = new URL("https://keeper.sh/dashboard/integrations");
  },
  buildRedirectUrl: (path: string, base: string) => new URL(path, base),
  handleOAuthCallback: () => Promise.resolve({
    redirectUrl: new URL("https://keeper.sh/dashboard/integrations"),
    userId: "user-1",
  }),
  parseOAuthCallback: () => ({ code: "code", error: null, provider: "google", state: "state" }),
}));
vi.mock("../../../../src/utils/destinations", () => ({
  exchangeCodeForTokens: () => Promise.resolve({
    access_token: "provider-access-token",
    expires_in: 3600,
    refresh_token: "provider-refresh-token",
  }),
  fetchUserInfo: () => Promise.resolve({ email: "user@example.com", id: "provider-user" }),
  validateState: () => Promise.resolve({ userId: "user-1" }),
}));
vi.mock("../../../../src/utils/oauth-source-credentials", () => ({
  createOAuthSourceCredential: () => Promise.resolve("credential-1"),
}));
vi.mock("../../../../src/utils/oauth-sources", () => ({
  importOAuthAccountCalendars: () => Promise.resolve("account-1"),
}));

type CallbackHandler = (context: {
  params: { provider: string };
  request: Request;
}) => Promise<Response>;

const invoke = (handler: unknown) => (handler as CallbackHandler)({
  params: { provider: "google" },
  request: new Request("https://keeper.sh/callback?code=code&state=state"),
});

describe("native provider callback routes", () => {
  it("returns a credential-free native destination ticket redirect", async () => {
    nativeContext.flow = "destination";
    const response = await invoke(destinationCallback);
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("ticket=opaque");
    expect(location).not.toContain("provider-access-token");
    expect(location).not.toContain("provider-refresh-token");
  });

  it("resumes native source setup with only the new account identifier", async () => {
    nativeContext.flow = "source";
    const response = await invoke(sourceCallback);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("resourceId=account-1");
    expect(location).not.toContain("provider-access-token");
    expect(location).not.toContain("provider-refresh-token");
  });
});
