import { calendarAccountsTable } from "@keeper.sh/database/schema";
import { and, asc, eq } from "drizzle-orm";
import { database } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";
import { withAccountDisplay } from "@/utils/provider-display";

const buildRecovery = (account: { authType: string; id: string; provider: string }) => {
  if (account.authType === "oauth") {
    return {
      authorizePath: `/api/destinations/authorize?provider=${encodeURIComponent(account.provider)}&destinationId=${encodeURIComponent(account.id)}`,
      method: "GET",
    };
  }
  return {
    accountId: account.id,
    connectPath: "/api/destinations/caldav",
    method: "POST",
  };
};

const GET = withWideEvent(
  withAuth(async ({ userId }) => {
    const accounts = await database
      .select({
        authType: calendarAccountsTable.authType,
        accountIdentifier: calendarAccountsTable.accountId,
        displayName: calendarAccountsTable.displayName,
        email: calendarAccountsTable.email,
        id: calendarAccountsTable.id,
        provider: calendarAccountsTable.provider,
        reauthenticationSource: calendarAccountsTable.reauthenticationSource,
      })
      .from(calendarAccountsTable)
      .where(
        and(
          eq(calendarAccountsTable.userId, userId),
          eq(calendarAccountsTable.needsReauthentication, true),
        ),
      )
      .orderBy(asc(calendarAccountsTable.updatedAt));

    return Response.json(accounts.map((account) => ({
      ...withAccountDisplay(account),
      needsReauthentication: true,
      recovery: buildRecovery(account),
    })));
  }),
);

export { GET };
