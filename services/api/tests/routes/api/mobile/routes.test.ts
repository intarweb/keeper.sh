import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as registerDevice } from "../../../../src/routes/api/mobile/devices/index";
import { DELETE as disableDevice } from "../../../../src/routes/api/mobile/devices/[installation-id]";
import {
  GET as getPreferences,
  PATCH as patchPreferences,
} from "../../../../src/routes/api/mobile/notifications/preferences";
import { POST as redeemTicket } from "../../../../src/routes/api/mobile/oauth/tickets/redeem";
import { GET as getReauthentication } from "../../../../src/routes/api/mobile/reauthentication";
import { GET as getPlanManagement } from "../../../../src/routes/api/mobile/plan-management";

const mocks = vi.hoisted(() => ({
  env: {
    COMMERCIAL_MODE: true,
    MOBILE_PLAN_MANAGEMENT_URL: "https://keeper.sh/dashboard/upgrade" as string | undefined,
  },
  insertRow: { installationId: "installation-1" } as unknown,
  inserted: null as unknown,
  nativeResult: null as unknown,
  selectRows: [] as unknown[],
  updateSets: [] as unknown[],
  updated: null as unknown,
}));

vi.mock("../../../../src/utils/middleware", () => ({
  withAuth: (handler: (context: { userId?: string }) => Promise<Response>) =>
    (context: { userId?: string }) => {
      if (!context.userId) {
        return Promise.resolve(new Response("Unauthorized", { status: 401 }));
      }
      return handler(context);
    },
  withWideEvent: (handler: unknown) => handler,
}));

vi.mock("../../../../src/context", () => {
  const database = {
    execute: () => Promise.resolve(),
    insert: () => ({
      values: (value: unknown) => {
        mocks.inserted = value;
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([mocks.insertRow]),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => {
          const result = Object.assign(Promise.resolve(mocks.selectRows), {
            limit: () => Promise.resolve(mocks.selectRows),
            orderBy: () => Promise.resolve(mocks.selectRows),
          });
          return result;
        },
      }),
    }),
    update: () => ({
      set: (value: unknown) => {
        mocks.updateSets.push(value);
        return {
        where: () => ({
          returning: () => {
            if (mocks.updated) {
              return Promise.resolve([mocks.updated]);
            }
            return Promise.resolve([]);
          },
        }),
        };
      },
    }),
    transaction: <TResult>(work: (transaction: unknown) => Promise<TResult>) => work(database),
  };
  return {
    baseUrl: "https://keeper.sh",
    database,
    env: mocks.env,
    nativeOAuth: {
      redeemTicket: () => Promise.resolve(mocks.nativeResult),
    },
  };
});

type ContextHandler = (context: {
  params: Record<string, string>;
  request: Request;
  sessionId: string;
  userId: string;
}) => Promise<Response>;

const invoke = (
  handler: unknown,
  request: Request,
  params: Record<string, string> = {},
) => (handler as ContextHandler)({
  params,
  request,
  sessionId: "session-1",
  userId: "user-1",
});

const invokeUnauthenticated = (handler: unknown) =>
  (handler as ContextHandler)({
    params: {},
    request: new Request("https://keeper.sh/api/mobile/test"),
    sessionId: "",
    userId: "",
  });

beforeEach(() => {
  mocks.env.COMMERCIAL_MODE = true;
  mocks.env.MOBILE_PLAN_MANAGEMENT_URL = "https://keeper.sh/dashboard/upgrade";
  mocks.insertRow = { installationId: "installation-1" };
  mocks.inserted = null;
  mocks.nativeResult = null;
  mocks.selectRows = [];
  mocks.updated = null;
  mocks.updateSets = [];
});

describe("mobile route authentication", () => {
  it("guards every mobile endpoint with session auth", async () => {
    const handlers = [
      registerDevice,
      disableDevice,
      getPreferences,
      patchPreferences,
      redeemTicket,
      getReauthentication,
      getPlanManagement,
    ];
    for (const handler of handlers) {
      const response = await invokeUnauthenticated(handler);
      expect(response.status).toBe(401);
    }
  });
});

describe("mobile device routes", () => {
  it("rejects malformed registration and persists a valid owned installation", async () => {
    const invalid = await invoke(
      registerDevice,
      new Request("https://keeper.sh/api/mobile/devices", {
        body: JSON.stringify({ installationId: "", platform: "web" }),
        method: "POST",
      }),
    );
    expect(invalid.status).toBe(400);

    const valid = await invoke(
      registerDevice,
      new Request("https://keeper.sh/api/mobile/devices", {
        body: JSON.stringify({ installationId: "installation-1", platform: "ios" }),
        method: "POST",
      }),
    );
    expect(valid.status).toBe(201);
    expect(mocks.inserted).toMatchObject({ userId: "user-1" });
  });

  it("returns not found for a device not owned by the user and disables an owned device", async () => {
    const missing = await invoke(
      disableDevice,
      new Request("https://keeper.sh/api/mobile/devices/other", { method: "DELETE" }),
      { "installation-id": "other" },
    );
    expect(missing.status).toBe(404);

    mocks.updated = { installationId: "installation-1" };
    mocks.selectRows = [{ id: "device-1", pushToken: "ExponentPushToken[test]" }];
    const disabled = await invoke(
      disableDevice,
      new Request("https://keeper.sh/api/mobile/devices/installation-1", { method: "DELETE" }),
      { "installation-id": "installation-1" },
    );
    expect(disabled.status).toBe(200);
    expect(mocks.updateSets).toContainEqual({
      lastError: "Device registration revoked",
      status: "dead",
    });
  });

  it("dead-letters old deliveries before a revoked installation is re-enabled", async () => {
    mocks.selectRows = [{ id: "device-1", pushToken: "ExponentPushToken[test]" }];
    mocks.updated = { installationId: "installation-1" };
    const revoked = await invoke(
      disableDevice,
      new Request("https://keeper.sh/api/mobile/devices/installation-1", { method: "DELETE" }),
      { "installation-id": "installation-1" },
    );
    expect(revoked.status).toBe(200);

    const reenabled = await invoke(
      registerDevice,
      new Request("https://keeper.sh/api/mobile/devices", {
        body: JSON.stringify({
          installationId: "installation-1",
          platform: "ios",
          pushToken: "ExponentPushToken[test]",
        }),
        method: "POST",
      }),
    );
    expect(reenabled.status).toBe(201);
    expect(mocks.updateSets.filter((value) => (
      typeof value === "object"
      && value !== null
      && "status" in value
      && value.status === "dead"
    ))).toHaveLength(2);
  });

  it("dead-letters deliveries owned by the old registration before transferring a token", async () => {
    mocks.selectRows = [{ id: "old-device", pushToken: "ExponentPushToken[transfer]" }];
    const response = await invoke(
      registerDevice,
      new Request("https://keeper.sh/api/mobile/devices", {
        body: JSON.stringify({
          installationId: "new-installation",
          platform: "android",
          pushToken: "ExponentPushToken[transfer]",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.updateSets).toContainEqual({
      lastError: "Device registration replaced",
      status: "dead",
    });
  });
});

describe("mobile preferences and recovery routes", () => {
  it("returns secure defaults and rejects an empty preferences patch", async () => {
    const defaults = await invoke(
      getPreferences,
      new Request("https://keeper.sh/api/mobile/notifications/preferences"),
    );
    await expect(defaults.json()).resolves.toEqual({
      invites: true,
      reauthentication: true,
      syncFailures: true,
    });

    const invalid = await invoke(
      patchPreferences,
      new Request("https://keeper.sh/api/mobile/notifications/preferences", {
        body: "{}",
        method: "PATCH",
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("accepts explicit notification opt-outs", async () => {
    mocks.insertRow = {
      invites: false,
      reauthentication: true,
      syncFailures: true,
    };
    const response = await invoke(
      patchPreferences,
      new Request("https://keeper.sh/api/mobile/notifications/preferences", {
        body: JSON.stringify({ invites: false }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ invites: false });
  });

  it("returns only reauthentication recovery records selected for this user", async () => {
    mocks.selectRows = [{
      accountIdentifier: "provider-account",
      authType: "oauth",
      displayName: "Work",
      email: "user@example.com",
      id: "account-1",
      provider: "google",
      reauthenticationSource: "token-refresh",
    }];
    const response = await invoke(
      getReauthentication,
      new Request("https://keeper.sh/api/mobile/reauthentication"),
    );
    const body = await response.json() as Record<string, unknown>[];
    expect(body[0]).toMatchObject({
      needsReauthentication: true,
      recovery: { method: "GET" },
    });
  });

  it("routes CalDAV recovery through the supported credential reconnect endpoint", async () => {
    mocks.selectRows = [{
      accountIdentifier: null,
      authType: "caldav",
      displayName: "Fastmail",
      email: "user@example.com",
      id: "account-2",
      provider: "fastmail",
      reauthenticationSource: "source-credentials",
    }];
    const response = await invoke(
      getReauthentication,
      new Request("https://keeper.sh/api/mobile/reauthentication"),
    );
    const body = await response.json() as Record<string, unknown>[];
    expect(body[0]).toMatchObject({
      recovery: {
        accountId: "account-2",
        connectPath: "/api/destinations/caldav",
        method: "POST",
      },
    });
  });

  it("returns an HTTPS-only plan-management link", async () => {
    const response = await invoke(
      getPlanManagement,
      new Request("https://keeper.sh/api/mobile/plan-management"),
    );
    await expect(response.json()).resolves.toEqual({
      url: "https://keeper.sh/dashboard/upgrade",
    });
  });

  it("rejects configured plan links containing credentials or fragments", async () => {
    mocks.env.MOBILE_PLAN_MANAGEMENT_URL = "https://user:pass@keeper.sh/dashboard/upgrade";
    const credentials = await invoke(
      getPlanManagement,
      new Request("https://keeper.sh/api/mobile/plan-management"),
    );
    await expect(credentials.json()).resolves.toEqual({ url: null });

    mocks.env.MOBILE_PLAN_MANAGEMENT_URL = "https://keeper.sh/dashboard/upgrade#secret";
    const fragment = await invoke(
      getPlanManagement,
      new Request("https://keeper.sh/api/mobile/plan-management"),
    );
    await expect(fragment.json()).resolves.toEqual({ url: null });
  });

  it("falls back to the web upgrade flow and hides billing for noncommercial servers", async () => {
    mocks.env.MOBILE_PLAN_MANAGEMENT_URL = globalThis.undefined;
    const fallback = await invoke(
      getPlanManagement,
      new Request("https://keeper.sh/api/mobile/plan-management"),
    );
    await expect(fallback.json()).resolves.toEqual({
      url: "https://keeper.sh/dashboard/upgrade",
    });

    mocks.env.COMMERCIAL_MODE = false;
    const selfHosted = await invoke(
      getPlanManagement,
      new Request("https://keeper.sh/api/mobile/plan-management"),
    );
    await expect(selfHosted.json()).resolves.toEqual({ url: null });
  });
});

describe("mobile OAuth ticket route", () => {
  it("rejects malformed and invalid tickets", async () => {
    const malformed = await invoke(
      redeemTicket,
      new Request("https://keeper.sh/api/mobile/oauth/tickets/redeem", {
        body: "{}",
        method: "POST",
      }),
    );
    expect(malformed.status).toBe(400);

    const invalid = await invoke(
      redeemTicket,
      new Request("https://keeper.sh/api/mobile/oauth/tickets/redeem", {
        body: JSON.stringify({ ticket: "invalid" }),
        method: "POST",
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("returns the credential-free handoff under no-store", async () => {
    mocks.nativeResult = {
      expiresAt: Date.now() + 1000,
      flow: "source",
      provider: "google",
      resourceId: "account-1",
      status: "success",
    };
    const response = await invoke(
      redeemTicket,
      new Request("https://keeper.sh/api/mobile/oauth/tickets/redeem", {
        body: JSON.stringify({ ticket: "valid" }),
        method: "POST",
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("refreshToken");
  });
});
