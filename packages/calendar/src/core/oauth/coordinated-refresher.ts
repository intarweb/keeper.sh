import type { RefreshLockStore } from "./refresh-coordinator";
import { runWithCredentialRefreshLock } from "./refresh-coordinator";
import { isOAuthReauthRequiredError } from "./error-classification";
import {
  calendarAccountsTable,
  oauthCredentialsTable,
} from "@keeper.sh/database/schema";
import { and, eq, sql } from "drizzle-orm";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";

const MS_PER_SECOND = 1000;

interface CoordinatedRefresherOptions {
  database: BunSQLDatabase;
  oauthCredentialId: string;
  calendarAccountId: string;
  onBookkeepingError?: (scope: string, error: unknown) => void;
  refreshLockStore: RefreshLockStore | null;
  rawRefresh: (refreshToken: string) => Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  }>;
}

const flagAccountReauthentication = async (
  database: BunSQLDatabase,
  oauthCredentialId: string,
  calendarAccountId: string,
  refreshToken: string,
): Promise<void> => {
  await database
    .update(calendarAccountsTable)
    .set({ needsReauthentication: true })
    .where(and(
      eq(calendarAccountsTable.id, calendarAccountId),
      sql`exists (
        select 1 from ${oauthCredentialsTable}
        where ${oauthCredentialsTable.id} = ${oauthCredentialId}
          and ${oauthCredentialsTable.refreshToken} = ${refreshToken}
      )`,
    ));
};

const createCoordinatedRefresher = (options: CoordinatedRefresherOptions) => {
  const {
    database,
    oauthCredentialId,
    calendarAccountId,
    onBookkeepingError,
    refreshLockStore,
    rawRefresh,
  } = options;

  return (refreshToken: string) =>
    runWithCredentialRefreshLock(
      oauthCredentialId,
      async () => {
        try {
          const result = await rawRefresh(refreshToken);

          const newExpiresAt = new Date(Date.now() + result.expires_in * MS_PER_SECOND);

          await database
            .update(oauthCredentialsTable)
            .set({
              accessToken: result.access_token,
              expiresAt: newExpiresAt,
              refreshToken: result.refresh_token ?? refreshToken,
            })
            .where(and(
              eq(oauthCredentialsTable.id, oauthCredentialId),
              eq(oauthCredentialsTable.refreshToken, refreshToken),
            ));

          return result;
        } catch (error) {
          if (isOAuthReauthRequiredError(error)) {
            await flagAccountReauthentication(
              database,
              oauthCredentialId,
              calendarAccountId,
              refreshToken,
            ).catch((bookkeepingError: unknown) => {
              onBookkeepingError?.("oauth.reauth_flag_error", bookkeepingError);
            });
          }
          throw error;
        }
      },
      refreshLockStore,
    );
};

export { createCoordinatedRefresher };
export type { CoordinatedRefresherOptions };
