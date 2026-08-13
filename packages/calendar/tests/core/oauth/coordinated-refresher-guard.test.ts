import { calendarAccountsTable, oauthCredentialsTable } from "@keeper.sh/database/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { describe, expect, it } from "vitest";
import { createCoordinatedRefresher } from "../../../src/core/oauth/coordinated-refresher";

const ACCOUNT_ID = "2b7e9c14-6d08-4f35-a92c-5e0b1d8a3f76";
const CREDENTIAL_ID = "8f4a1c05-2e63-47d9-b810-3c9e6f2a5d41";
const FAILED_REFRESH_TOKEN = "revoked-refresh-token";

interface RecordedWrite {
  table: string;
  values: Record<string, unknown>;
}

const tableNames = new Map<unknown, string>([
  [calendarAccountsTable, "calendar_accounts"],
  [oauthCredentialsTable, "oauth_credentials"],
]);

const resolveTableName = (table: unknown): string => {
  const name = tableNames.get(table);
  if (!name) {
    throw new Error("Unexpected table written by the coordinated refresher");
  }
  return name;
};

interface StubOptions {
  selectResult: () => Promise<{ refreshToken: string }[]>;
  updateResult?: (table: string) => Promise<unknown>;
}

const createDatabaseStub = (options: StubOptions) => {
  const writes: RecordedWrite[] = [];
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => options.selectResult(),
        }),
      }),
    }),
    update: (table: unknown) => {
      const name = resolveTableName(table);
      return {
        set: (values: Record<string, unknown>) => {
          writes.push({ table: name, values });
          return {
            where: () => options.updateResult?.(name) ?? Promise.resolve([]),
          };
        },
      };
    },
  };

  return { database: database as unknown as BunSQLDatabase, writes };
};

const deadCredentialRefresh = () =>
  Promise.reject(new Error("Token refresh failed (400): invalid_grant"));

type RawRefresh = () => Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}>;

const buildRefresher = (database: BunSQLDatabase, rawRefresh: RawRefresh) =>
  createCoordinatedRefresher({
    calendarAccountId: ACCOUNT_ID,
    database,
    oauthCredentialId: CREDENTIAL_ID,
    rawRefresh,
    refreshLockStore: null,
  });

describe("the guard that checks whether the failed refresh token is still stored", () => {
  it("keeps the credential failure classifiable when the guard read fails", async () => {
    const { database, writes } = createDatabaseStub({
      selectResult: () => Promise.reject(new Error("statement timeout on oauth_credentials")),
    });
    const refresh = buildRefresher(database, deadCredentialRefresh);

    await expect(refresh(FAILED_REFRESH_TOKEN)).rejects.toThrow("invalid_grant");
    expect(writes).toEqual([]);
  });

  it("keeps the credential failure classifiable when the marker write fails", async () => {
    const { database } = createDatabaseStub({
      selectResult: () => Promise.resolve([{ refreshToken: FAILED_REFRESH_TOKEN }]),
      updateResult: (table) => {
        if (table === "calendar_accounts") {
          return Promise.reject(new Error("deadlock detected on calendar_accounts"));
        }
        return Promise.resolve([]);
      },
    });
    const refresh = buildRefresher(database, deadCredentialRefresh);

    await expect(refresh(FAILED_REFRESH_TOKEN)).rejects.toThrow("invalid_grant");
  });

  it("leaves the account alone when the credential row has been deleted", async () => {
    const { database, writes } = createDatabaseStub({
      selectResult: () => Promise.resolve([]),
    });
    const refresh = buildRefresher(database, deadCredentialRefresh);

    await expect(refresh(FAILED_REFRESH_TOKEN)).rejects.toThrow("invalid_grant");
    expect(writes).toEqual([]);
  });
});

describe("a refresh that succeeds", () => {
  it("never touches the account marker and stores the rotated refresh token", async () => {
    const { database, writes } = createDatabaseStub({
      selectResult: () => Promise.reject(new Error("the guard must not run on success")),
    });
    const refresh = buildRefresher(database, () =>
      Promise.resolve({
        access_token: "fresh-access-token",
        expires_in: 3600,
        refresh_token: "rotated-refresh-token",
      }));

    await refresh(FAILED_REFRESH_TOKEN);

    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe("oauth_credentials");
    expect(writes[0]?.values.refreshToken).toBe("rotated-refresh-token");
  });

  it("keeps the supplied refresh token when the provider omits a rotated one", async () => {
    const { database, writes } = createDatabaseStub({
      selectResult: () => Promise.reject(new Error("the guard must not run on success")),
    });
    const refresh = buildRefresher(database, () =>
      Promise.resolve({ access_token: "fresh-access-token", expires_in: 3600 }));

    await refresh(FAILED_REFRESH_TOKEN);

    expect(writes[0]?.values.refreshToken).toBe(FAILED_REFRESH_TOKEN);
  });
});
