import {
  notificationPreferencesTable,
  pushNotificationOutboxTable,
} from "@keeper.sh/database/schema";
import { and, eq, or } from "drizzle-orm";
import { database } from "@/context";
import type {
  CalendarInviteNotificationPayload,
  MobileNotificationPayload,
  MobileNotificationType,
  ReauthenticationNotificationPayload,
  SyncFailedNotificationPayload,
} from "@/mobile/contracts";
import { isNotificationEnabled } from "./notification-preferences";

const TEXT_ENCODER = new TextEncoder();

const createReauthenticationNotificationKey = (accountId: string): string =>
  `reauthentication:${accountId}`;

const clearReauthenticationNotification = async (accountId: string): Promise<void> => {
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
    .where(eq(pushNotificationOutboxTable.idempotencyKey, idempotencyKey));
};

const createNotificationIdempotencyKey = async (
  type: MobileNotificationType,
  parts: string[],
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    TEXT_ENCODER.encode(parts.join("\u0000")),
  );
  return `${type}:${Buffer.from(digest).toString("base64url")}`;
};

const enqueuePushNotification = async (input: {
  idempotencyKey?: string;
  payload: MobileNotificationPayload;
  type: MobileNotificationType;
  userId: string;
}): Promise<string | null> => {
  const [preferences] = await database
    .select({
      invites: notificationPreferencesTable.invites,
      reauthentication: notificationPreferencesTable.reauthentication,
      syncFailures: notificationPreferencesTable.syncFailures,
    })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, input.userId))
    .limit(1);

  if (!isNotificationEnabled(preferences, input.type)) {
    return null;
  }

  const [row] = await database
    .insert(pushNotificationOutboxTable)
    .values({
      idempotencyKey: input.idempotencyKey ?? null,
      payload: input.payload as unknown as Record<string, unknown>,
      type: input.type,
      userId: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: pushNotificationOutboxTable.id });
  return row?.id ?? null;
};

const enqueueReauthenticationNotification = (
  userId: string,
  payload: ReauthenticationNotificationPayload,
  idempotencyKey?: string,
) => enqueuePushNotification({
  idempotencyKey,
  payload,
  type: "reauthentication_required",
  userId,
});

const enqueueSyncFailureNotification = (
  userId: string,
  payload: SyncFailedNotificationPayload,
  idempotencyKey?: string,
) => enqueuePushNotification({
  idempotencyKey,
  payload,
  type: "sync_failed",
  userId,
});

const enqueueCalendarInviteNotification = (
  userId: string,
  payload: CalendarInviteNotificationPayload,
  idempotencyKey?: string,
) => enqueuePushNotification({
  idempotencyKey,
  payload,
  type: "calendar_invite",
  userId,
});

export {
  clearReauthenticationNotification,
  createNotificationIdempotencyKey,
  createReauthenticationNotificationKey,
  enqueueCalendarInviteNotification,
  enqueuePushNotification,
  enqueueReauthenticationNotification,
  enqueueSyncFailureNotification,
};
