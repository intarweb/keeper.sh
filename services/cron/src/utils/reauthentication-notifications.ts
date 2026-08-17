import {
  calendarAccountsTable,
  notificationPreferencesTable,
  pushNotificationOutboxTable,
} from "@keeper.sh/database/schema";
import { and, eq, or } from "drizzle-orm";
import type { database as ContextDatabase } from "@/context";

type NotificationDatabase = typeof ContextDatabase;

interface ReauthenticationNotificationDemand {
  accountId: string;
  needsReauthentication: boolean;
}

const createReauthenticationNotificationKey = (accountId: string): string =>
  `reauthentication:${accountId}`;

const clearReauthenticationNotification = async (
  database: NotificationDatabase,
  accountId: string,
): Promise<void> => {
  const idempotencyKey = createReauthenticationNotificationKey(accountId);
  await database
    .update(pushNotificationOutboxTable)
    .set({
      idempotencyKey: null,
      lastError: "Reauthentication demand cleared",
      status: "dead",
    })
    .where(and(
      eq(pushNotificationOutboxTable.idempotencyKey, idempotencyKey),
      or(
        eq(pushNotificationOutboxTable.status, "pending"),
        eq(pushNotificationOutboxTable.status, "processing"),
      ),
    ));
  await database
    .update(pushNotificationOutboxTable)
    .set({ idempotencyKey: null })
    .where(and(
      eq(pushNotificationOutboxTable.idempotencyKey, idempotencyKey),
      or(
        eq(pushNotificationOutboxTable.status, "delivered"),
        eq(pushNotificationOutboxTable.status, "dead"),
      ),
    ));
};

const ensureReauthenticationNotification = async (
  database: NotificationDatabase,
  accountId: string,
): Promise<string | null> => {
  const [account] = await database
    .select({
      provider: calendarAccountsTable.provider,
      userId: calendarAccountsTable.userId,
    })
    .from(calendarAccountsTable)
    .where(eq(calendarAccountsTable.id, accountId))
    .limit(1);
  if (!account) {
    return null;
  }
  const [preferences] = await database
    .select({ enabled: notificationPreferencesTable.reauthentication })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, account.userId))
    .limit(1);
  if (preferences && !preferences.enabled) {
    return null;
  }
  const [notification] = await database
    .insert(pushNotificationOutboxTable)
    .values({
      idempotencyKey: createReauthenticationNotificationKey(accountId),
      payload: {
        accountId,
        deepLink: { params: { id: accountId }, path: "/accounts/[id]" },
        provider: account.provider,
      },
      type: "reauthentication_required",
      userId: account.userId,
    })
    .onConflictDoNothing()
    .returning({ id: pushNotificationOutboxTable.id });
  return notification?.id ?? null;
};

const convergeReauthenticationNotification = async (
  database: NotificationDatabase,
  demand: ReauthenticationNotificationDemand,
): Promise<string | null> => {
  if (demand.needsReauthentication) {
    return ensureReauthenticationNotification(database, demand.accountId);
  }
  await clearReauthenticationNotification(database, demand.accountId);
  return null;
};

export {
  convergeReauthenticationNotification,
  createReauthenticationNotificationKey,
};
export type { ReauthenticationNotificationDemand };
