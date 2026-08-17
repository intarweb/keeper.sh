import type { IngestionPendingInvitation } from "@keeper.sh/calendar";
import {
  notificationPreferencesTable,
  pushNotificationOutboxTable,
} from "@keeper.sh/database/schema";
import { eq } from "drizzle-orm";
import type { database as ContextDatabase } from "@/context";

type NotificationDatabase = typeof ContextDatabase;

interface InvitationNotificationBatch {
  calendarId: string;
  invitations: IngestionPendingInvitation[];
  userId: string;
}

const TEXT_ENCODER = new TextEncoder();
const INVITATION_LOOKBACK_MS = 24 * 60 * 60_000;

const createInvitationNotificationKey = async (
  input: Omit<InvitationNotificationBatch, "invitations"> & IngestionPendingInvitation,
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    TEXT_ENCODER.encode([
      input.userId,
      input.calendarId,
      input.sourceEventUid,
      input.occurrenceStart,
    ].join("\u0000")),
  );
  return `calendar_invite:${Buffer.from(digest).toString("base64url")}`;
};

const enqueueInvitationNotifications = async (
  database: NotificationDatabase,
  batch: InvitationNotificationBatch,
): Promise<number> => {
  if (batch.invitations.length === 0) {
    return 0;
  }
  const oldestActionableStart = Date.now() - INVITATION_LOOKBACK_MS;
  const actionableInvitations = batch.invitations.filter(({ occurrenceStart }) => {
    const instant = new Date(occurrenceStart).getTime();
    return Number.isFinite(instant) && instant >= oldestActionableStart;
  });
  if (actionableInvitations.length === 0) {
    return 0;
  }
  const [preferences] = await database
    .select({ enabled: notificationPreferencesTable.invites })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, batch.userId))
    .limit(1);
  if (preferences && !preferences.enabled) {
    return 0;
  }
  const keyedInvitations = await Promise.all(actionableInvitations.map(async (invitation) => ({
    idempotencyKey: await createInvitationNotificationKey({
      ...invitation,
      calendarId: batch.calendarId,
      userId: batch.userId,
    }),
    invitation,
  })));
  const uniqueInvitations = [...new Map(
    keyedInvitations.map((entry) => [entry.idempotencyKey, entry]),
  ).values()];
  const inserted = await database
    .insert(pushNotificationOutboxTable)
    .values(uniqueInvitations.map(({ idempotencyKey, invitation }) => ({
      idempotencyKey,
      payload: {
        calendarId: batch.calendarId,
        deepLink: { params: { calendarId: batch.calendarId }, path: "/invitations" },
        sourceEventUid: invitation.sourceEventUid,
      },
      type: "calendar_invite",
      userId: batch.userId,
    })))
    .onConflictDoNothing()
    .returning({ id: pushNotificationOutboxTable.id });
  return inserted.length;
};

export {
  createInvitationNotificationKey,
  enqueueInvitationNotifications,
};
export type { InvitationNotificationBatch };
