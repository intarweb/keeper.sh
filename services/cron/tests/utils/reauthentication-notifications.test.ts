import { describe, expect, it, vi } from "vitest";
import {
  convergeReauthenticationNotification,
  createReauthenticationNotificationKey,
} from "../../src/utils/reauthentication-notifications";

type NotificationDatabase = Parameters<typeof convergeReauthenticationNotification>[0];

const createSelectQuery = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({
      limit: () => Promise.resolve(rows),
    }),
  }),
});

const createDatabase = (options?: { account?: boolean; preference?: boolean }) => {
  const hasAccount = options?.account !== false;
  const accountRows: unknown[] = [];
  if (hasAccount) {
    accountRows.push({ provider: "google", userId: "user-1" });
  }
  const preferenceRows: unknown[] = [];
  if (options?.preference !== globalThis.undefined) {
    preferenceRows.push({ enabled: options.preference });
  }
  const select = vi.fn()
    .mockReturnValueOnce(createSelectQuery(accountRows))
    .mockReturnValueOnce(createSelectQuery(preferenceRows));
  const values = vi.fn(() => ({
    onConflictDoNothing: () => ({
      returning: () => Promise.resolve([{ id: "notification-1" }]),
    }),
  }));
  const insert = vi.fn(() => ({ values }));
  const set = vi.fn(() => ({ where: () => Promise.resolve() }));
  const update = vi.fn(() => ({ set }));
  return {
    database: { insert, select, update } as unknown as NotificationDatabase,
    insert,
    set,
    values,
  };
};

describe("cron reauthentication notification convergence", () => {
  it("enqueues one privacy-safe intent while an ingest demand is raised", async () => {
    const { database, values } = createDatabase();

    await expect(convergeReauthenticationNotification(database, {
      accountId: "account-1",
      needsReauthentication: true,
    })).resolves.toBe("notification-1");

    expect(values).toHaveBeenCalledWith({
      idempotencyKey: createReauthenticationNotificationKey("account-1"),
      payload: {
        accountId: "account-1",
        deepLink: { params: { id: "account-1" }, path: "/accounts/[id]" },
        provider: "google",
      },
      type: "reauthentication_required",
      userId: "user-1",
    });
  });

  it("honors an explicit notification opt-out", async () => {
    const { database, insert } = createDatabase({ preference: false });

    await expect(convergeReauthenticationNotification(database, {
      accountId: "account-1",
      needsReauthentication: true,
    })).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("cancels queued work and releases the cycle key after recovery", async () => {
    const { database, set } = createDatabase();

    await expect(convergeReauthenticationNotification(database, {
      accountId: "account-1",
      needsReauthentication: false,
    })).resolves.toBeNull();

    expect(set).toHaveBeenNthCalledWith(1, {
      idempotencyKey: null,
      lastError: "Reauthentication demand cleared",
      status: "dead",
    });
    expect(set).toHaveBeenNthCalledWith(2, { idempotencyKey: null });
  });
});
