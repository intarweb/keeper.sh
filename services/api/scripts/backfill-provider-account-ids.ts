import { calendarAccountsTable, oauthCredentialsTable } from "@keeper.sh/database/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { database, oauthProviders } from "@/context";

const PUSH_PROVIDERS = ["google", "outlook"];
const EXPIRY_SKEW_MS = 60_000;

interface BackfillRow {
  accountRowId: string;
  provider: string;
  email: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  credentialNeedsReauthentication: boolean;
  accountNeedsReauthentication: boolean;
}

interface BackfillTally {
  updated: number;
  skippedReauth: number;
  failed: number;
  unchanged: number;
}

const selectCandidates = (): Promise<BackfillRow[]> =>
  database
    .select({
      accountRowId: calendarAccountsTable.id,
      provider: calendarAccountsTable.provider,
      email: calendarAccountsTable.email,
      accessToken: oauthCredentialsTable.accessToken,
      refreshToken: oauthCredentialsTable.refreshToken,
      expiresAt: oauthCredentialsTable.expiresAt,
      credentialNeedsReauthentication: oauthCredentialsTable.needsReauthentication,
      accountNeedsReauthentication: calendarAccountsTable.needsReauthentication,
    })
    .from(calendarAccountsTable)
    .innerJoin(
      oauthCredentialsTable,
      eq(calendarAccountsTable.oauthCredentialId, oauthCredentialsTable.id),
    )
    .where(and(
      inArray(calendarAccountsTable.provider, PUSH_PROVIDERS),
      or(
        isNull(calendarAccountsTable.accountId),
        eq(calendarAccountsTable.accountId, ""),
      ),
    ));

const resolveAccessToken = async (row: BackfillRow): Promise<string> => {
  if (row.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
    return row.accessToken;
  }

  const provider = oauthProviders.getProvider(row.provider);
  if (!provider) {
    throw new Error(`No OAuth provider registered for ${row.provider}`);
  }

  const refreshed = await provider.refreshAccessToken(row.refreshToken);
  return refreshed.access_token;
};

const resolveProviderAccountId = async (row: BackfillRow): Promise<string> => {
  const provider = oauthProviders.getProvider(row.provider);
  if (!provider) {
    throw new Error(`No OAuth provider registered for ${row.provider}`);
  }

  const accessToken = await resolveAccessToken(row);
  const userInfo = await provider.fetchUserInfo(accessToken);

  if (!userInfo.id) {
    throw new Error(`${row.provider} returned no account id for ${row.email ?? row.accountRowId}`);
  }

  return userInfo.id;
};

const backfillRow = async (row: BackfillRow, tally: BackfillTally): Promise<void> => {
  if (row.accountNeedsReauthentication || row.credentialNeedsReauthentication) {
    tally.skippedReauth += 1;
    console.log(`skip ${row.provider} ${row.email ?? row.accountRowId}: needs reauthentication`);
    return;
  }

  try {
    const providerAccountId = await resolveProviderAccountId(row);

    await database
      .update(calendarAccountsTable)
      .set({ accountId: providerAccountId })
      .where(eq(calendarAccountsTable.id, row.accountRowId));

    tally.updated += 1;
    console.log(`ok   ${row.provider} ${row.email ?? row.accountRowId} -> ${providerAccountId}`);
  } catch (error) {
    tally.failed += 1;
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`fail ${row.provider} ${row.email ?? row.accountRowId}: ${reason}`);
  }
};

const run = async (): Promise<void> => {
  const rows = await selectCandidates();
  console.log(`found ${rows.length} account(s) missing a provider account id`);

  const tally: BackfillTally = { updated: 0, skippedReauth: 0, failed: 0, unchanged: 0 };

  for (const row of rows) {
    await backfillRow(row, tally);
  }

  console.log(
    `done: ${tally.updated} updated, ${tally.skippedReauth} skipped (reauth), ${tally.failed} failed`,
  );

  if (tally.failed > 0) {
    process.exitCode = 1;
  }
};

await run();
