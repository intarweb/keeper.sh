import { calendarAccountsTable, oauthCredentialsTable } from "@keeper.sh/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { database } from "@/context";
import { clearSourceReauthentication } from "./source-reauthentication";

interface CreateOAuthSourceCredentialData {
  provider: string;
  email: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

const findSourceCredentialId = async (
  userId: string,
  provider: string,
  email: string | null,
): Promise<string | undefined> => {
  const candidates = await database
    .select({
      id: oauthCredentialsTable.id,
      sourceAccountId: calendarAccountsTable.id,
    })
    .from(oauthCredentialsTable)
    .leftJoin(
      calendarAccountsTable,
      and(
        eq(calendarAccountsTable.oauthCredentialId, oauthCredentialsTable.id),
        eq(calendarAccountsTable.userId, userId),
        eq(calendarAccountsTable.provider, provider),
        isNull(calendarAccountsTable.accountId),
      ),
    )
    .where(
      and(
        eq(oauthCredentialsTable.userId, userId),
        eq(oauthCredentialsTable.provider, provider),
        eq(oauthCredentialsTable.email, email ?? ""),
      ),
    )
    .orderBy(oauthCredentialsTable.createdAt, oauthCredentialsTable.id);

  const sourceCandidate = candidates.find(({ sourceAccountId }) => sourceAccountId !== null);

  return (sourceCandidate ?? candidates[0])?.id;
};

const createOAuthSourceCredential = async (
  userId: string,
  data: CreateOAuthSourceCredentialData,
): Promise<string> => {
  const existingId = await findSourceCredentialId(userId, data.provider, data.email);

  if (existingId) {
    await database
      .update(oauthCredentialsTable)
      .set({
        accessToken: data.accessToken,
        expiresAt: data.expiresAt,
        needsReauthentication: false,
        refreshToken: data.refreshToken,
      })
      .where(eq(oauthCredentialsTable.id, existingId));

    await clearSourceReauthentication(database, existingId);

    return existingId;
  }

  const [credential] = await database
    .insert(oauthCredentialsTable)
    .values({
      accessToken: data.accessToken,
      email: data.email,
      expiresAt: data.expiresAt,
      provider: data.provider,
      refreshToken: data.refreshToken,
      userId,
    })
    .returning({ id: oauthCredentialsTable.id });

  if (!credential) {
    throw new Error("Failed to create OAuth source credential");
  }

  return credential.id;
};

export { createOAuthSourceCredential };
