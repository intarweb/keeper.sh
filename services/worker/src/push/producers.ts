import {
  notificationPreferencesTable,
  pushNotificationOutboxTable,
} from "@keeper.sh/database/schema";
import { eq } from "drizzle-orm";
import type { database as ContextDatabase } from "../context";

type ProducerDatabase = typeof ContextDatabase;

interface SyncFailureNotification {
  calendarId: string;
  idempotencyKey: string;
  userId: string;
}

const enqueueSyncFailureNotification = async (
  database: ProducerDatabase,
  notification: SyncFailureNotification,
): Promise<string | null> => {
  const [preferences] = await database
    .select({ enabled: notificationPreferencesTable.syncFailures })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, notification.userId))
    .limit(1);
  if (preferences && !preferences.enabled) {
    return null;
  }

  const [row] = await database
    .insert(pushNotificationOutboxTable)
    .values({
      idempotencyKey: notification.idempotencyKey,
      payload: {
        calendarId: notification.calendarId,
        deepLink: {
          params: { calendarId: notification.calendarId },
          path: "/calendar",
        },
      },
      type: "sync_failed",
      userId: notification.userId,
    })
    .onConflictDoNothing()
    .returning({ id: pushNotificationOutboxTable.id });
  return row?.id ?? null;
};

export { enqueueSyncFailureNotification };
export type { SyncFailureNotification };
