import {
  deviceInstallationsTable,
  notificationPreferencesTable,
  pushNotificationDeliveriesTable,
  pushNotificationOutboxTable,
} from "@keeper.sh/database/schema";
import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { database as ContextDatabase } from "../context";
import type {
  ClaimedPushDelivery,
  ClaimedPushReceipt,
  PushOutboxRepository,
} from "./types";

type PushDatabase = typeof ContextDatabase;

const notificationTypeIsEnabled = or(
  isNull(notificationPreferencesTable.userId),
  and(
    eq(pushNotificationOutboxTable.type, "calendar_invite"),
    eq(notificationPreferencesTable.invites, true),
  ),
  and(
    eq(pushNotificationOutboxTable.type, "reauthentication_required"),
    eq(notificationPreferencesTable.reauthentication, true),
  ),
  and(
    eq(pushNotificationOutboxTable.type, "sync_failed"),
    eq(notificationPreferencesTable.syncFailures, true),
  ),
);

const createPushOutboxRepository = (database: PushDatabase): PushOutboxRepository => {
  const reconcileNotification = async (notificationId: string): Promise<void> => {
    const deliveries = await database
      .select({ status: pushNotificationDeliveriesTable.status })
      .from(pushNotificationDeliveriesTable)
      .where(eq(pushNotificationDeliveriesTable.notificationId, notificationId));
    if (deliveries.length === 0) {
      return;
    }
    const terminal = deliveries.every(({ status }) => status === "delivered" || status === "dead");
    if (!terminal) {
      return;
    }
    let status = "dead";
    if (deliveries.some((delivery) => delivery.status === "delivered")) {
      status = "delivered";
    }
    const update: { deliveredAt?: Date; status: string } = { status };
    if (status === "delivered") {
      update.deliveredAt = new Date();
    }
    await database
      .update(pushNotificationOutboxTable)
      .set(update)
      .where(eq(pushNotificationOutboxTable.id, notificationId));
  };

  const materializeNotifications = async (
    limit: number,
    now: Date,
    staleBefore: Date,
  ): Promise<number> => {
    const candidates = await database
      .select({
        id: pushNotificationOutboxTable.id,
        invitesEnabled: notificationPreferencesTable.invites,
        reauthenticationEnabled: notificationPreferencesTable.reauthentication,
        syncFailuresEnabled: notificationPreferencesTable.syncFailures,
        type: pushNotificationOutboxTable.type,
        userId: pushNotificationOutboxTable.userId,
      })
      .from(pushNotificationOutboxTable)
      .leftJoin(
        notificationPreferencesTable,
        eq(notificationPreferencesTable.userId, pushNotificationOutboxTable.userId),
      )
      .where(or(
        and(
          eq(pushNotificationOutboxTable.status, "pending"),
          lte(pushNotificationOutboxTable.nextAttemptAt, now),
        ),
        and(
          eq(pushNotificationOutboxTable.status, "processing"),
          lte(pushNotificationOutboxTable.updatedAt, staleBefore),
        ),
      ))
      .orderBy(
        asc(pushNotificationOutboxTable.nextAttemptAt),
        asc(pushNotificationOutboxTable.createdAt),
      )
      .limit(limit);

    let materialized = 0;
    for (const candidate of candidates) {
      let notificationEnabled = candidate.syncFailuresEnabled !== false;
      if (candidate.type === "calendar_invite") {
        notificationEnabled = candidate.invitesEnabled !== false;
      } else if (candidate.type === "reauthentication_required") {
        notificationEnabled = candidate.reauthenticationEnabled !== false;
      }
      if (!notificationEnabled) {
        await database
          .update(pushNotificationOutboxTable)
          .set({ lastError: "Notification preference disabled", status: "dead" })
          .where(and(
            eq(pushNotificationOutboxTable.id, candidate.id),
            or(
              eq(pushNotificationOutboxTable.status, "pending"),
              eq(pushNotificationOutboxTable.status, "processing"),
            ),
          ));
        continue;
      }
      const [claimed] = await database
        .update(pushNotificationOutboxTable)
        .set({ status: "processing" })
        .where(and(
          eq(pushNotificationOutboxTable.id, candidate.id),
          or(
            eq(pushNotificationOutboxTable.status, "pending"),
            and(
              eq(pushNotificationOutboxTable.status, "processing"),
              lte(pushNotificationOutboxTable.updatedAt, staleBefore),
            ),
          ),
        ))
        .returning({ id: pushNotificationOutboxTable.id });
      if (!claimed) {
        continue;
      }

      const existingDeliveries = await database
        .select({
          enabled: deviceInstallationsTable.enabled,
          id: pushNotificationDeliveriesTable.id,
          token: deviceInstallationsTable.pushToken,
        })
        .from(pushNotificationDeliveriesTable)
        .innerJoin(
          deviceInstallationsTable,
          eq(deviceInstallationsTable.id, pushNotificationDeliveriesTable.installationId),
        )
        .where(eq(pushNotificationDeliveriesTable.notificationId, candidate.id));
      const inactiveDeliveries = existingDeliveries.filter(({ enabled, token }) => !enabled || !token);
      for (const delivery of inactiveDeliveries) {
        await database
          .update(pushNotificationDeliveriesTable)
          .set({ lastError: "Push token is no longer active", status: "dead" })
          .where(and(
            eq(pushNotificationDeliveriesTable.id, delivery.id),
            or(
              eq(pushNotificationDeliveriesTable.status, "pending"),
              eq(pushNotificationDeliveriesTable.status, "processing"),
              eq(pushNotificationDeliveriesTable.status, "receipt_pending"),
            ),
          ));
      }

      const installations = await database
        .select({ id: deviceInstallationsTable.id })
        .from(deviceInstallationsTable)
        .where(and(
          eq(deviceInstallationsTable.userId, candidate.userId),
          eq(deviceInstallationsTable.enabled, true),
          isNotNull(deviceInstallationsTable.pushToken),
        ));
      if (installations.length === 0) {
        await reconcileNotification(candidate.id);
        await database
          .update(pushNotificationOutboxTable)
          .set({ status: "delivered" })
          .where(eq(pushNotificationOutboxTable.id, candidate.id));
        materialized += 1;
        continue;
      }
      await database
        .insert(pushNotificationDeliveriesTable)
        .values(installations.map(({ id }) => ({
          installationId: id,
          notificationId: candidate.id,
        })))
        .onConflictDoNothing();
      await reconcileNotification(candidate.id);
      materialized += 1;
    }
    return materialized;
  };

  const claimSendBatch = async (
    limit: number,
    now: Date,
    staleBefore: Date,
  ): Promise<ClaimedPushDelivery[]> => {
    const candidates = await database
      .select({
        attempts: pushNotificationDeliveriesTable.attempts,
        id: pushNotificationDeliveriesTable.id,
        installationId: pushNotificationDeliveriesTable.installationId,
        notificationId: pushNotificationDeliveriesTable.notificationId,
        payload: pushNotificationOutboxTable.payload,
        token: deviceInstallationsTable.pushToken,
        type: pushNotificationOutboxTable.type,
      })
      .from(pushNotificationDeliveriesTable)
      .innerJoin(
        pushNotificationOutboxTable,
        eq(pushNotificationOutboxTable.id, pushNotificationDeliveriesTable.notificationId),
      )
      .innerJoin(
        deviceInstallationsTable,
        eq(deviceInstallationsTable.id, pushNotificationDeliveriesTable.installationId),
      )
      .leftJoin(
        notificationPreferencesTable,
        eq(notificationPreferencesTable.userId, pushNotificationOutboxTable.userId),
      )
      .where(and(
        eq(pushNotificationOutboxTable.status, "processing"),
        notificationTypeIsEnabled,
        eq(deviceInstallationsTable.enabled, true),
        isNotNull(deviceInstallationsTable.pushToken),
        or(
          and(
            eq(pushNotificationDeliveriesTable.status, "pending"),
            lte(pushNotificationDeliveriesTable.nextAttemptAt, now),
          ),
          and(
            eq(pushNotificationDeliveriesTable.status, "processing"),
            lte(pushNotificationDeliveriesTable.updatedAt, staleBefore),
          ),
        ),
      ))
      .orderBy(
        asc(pushNotificationDeliveriesTable.nextAttemptAt),
        asc(pushNotificationDeliveriesTable.createdAt),
      )
      .limit(limit);

    const claimed: ClaimedPushDelivery[] = [];
    for (const candidate of candidates) {
      if (!candidate.token) {
        continue;
      }
      const [updated] = await database
        .update(pushNotificationDeliveriesTable)
        .set({ status: "processing" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, candidate.id),
          or(
            eq(pushNotificationDeliveriesTable.status, "pending"),
            and(
              eq(pushNotificationDeliveriesTable.status, "processing"),
              lte(pushNotificationDeliveriesTable.updatedAt, staleBefore),
            ),
          ),
        ))
        .returning({ id: pushNotificationDeliveriesTable.id });
      if (updated) {
        claimed.push({ ...candidate, token: candidate.token });
      }
    }
    return claimed;
  };

  const claimReceiptBatch = async (
    limit: number,
    now: Date,
    staleBefore: Date,
  ): Promise<ClaimedPushReceipt[]> => {
    const candidates = await database
      .select({
        attempts: pushNotificationDeliveriesTable.attempts,
        id: pushNotificationDeliveriesTable.id,
        installationId: pushNotificationDeliveriesTable.installationId,
        notificationId: pushNotificationDeliveriesTable.notificationId,
        receiptId: pushNotificationDeliveriesTable.receiptId,
        token: deviceInstallationsTable.pushToken,
      })
      .from(pushNotificationDeliveriesTable)
      .innerJoin(
        pushNotificationOutboxTable,
        eq(pushNotificationOutboxTable.id, pushNotificationDeliveriesTable.notificationId),
      )
      .innerJoin(
        deviceInstallationsTable,
        eq(deviceInstallationsTable.id, pushNotificationDeliveriesTable.installationId),
      )
      .where(and(
        eq(pushNotificationOutboxTable.status, "processing"),
        isNotNull(pushNotificationDeliveriesTable.receiptId),
        or(
          and(
            eq(pushNotificationDeliveriesTable.status, "receipt_pending"),
            lte(pushNotificationDeliveriesTable.nextAttemptAt, now),
          ),
          and(
            eq(pushNotificationDeliveriesTable.status, "processing"),
            lte(pushNotificationDeliveriesTable.updatedAt, staleBefore),
          ),
        ),
      ))
      .orderBy(
        asc(pushNotificationDeliveriesTable.nextAttemptAt),
        asc(pushNotificationDeliveriesTable.createdAt),
      )
      .limit(limit);

    const claimed: ClaimedPushReceipt[] = [];
    for (const candidate of candidates) {
      if (!candidate.receiptId) {
        continue;
      }
      const [updated] = await database
        .update(pushNotificationDeliveriesTable)
        .set({ status: "processing" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, candidate.id),
          or(
            eq(pushNotificationDeliveriesTable.status, "receipt_pending"),
            and(
              eq(pushNotificationDeliveriesTable.status, "processing"),
              lte(pushNotificationDeliveriesTable.updatedAt, staleBefore),
            ),
          ),
        ))
        .returning({ id: pushNotificationDeliveriesTable.id });
      if (updated) {
        claimed.push({
          ...candidate,
          receiptId: candidate.receiptId,
          token: candidate.token ?? "",
        });
      }
    }
    return claimed;
  };

  const reconcileNotifications = async (notificationIds: string[]): Promise<void> => {
    if (notificationIds.length === 0) {
      return;
    }
    for (const notificationId of notificationIds) {
      await reconcileNotification(notificationId);
    }
  };

  return {
    cleanupTerminal: async (before, limit) => {
      const terminal = await database
        .select({ id: pushNotificationOutboxTable.id })
        .from(pushNotificationOutboxTable)
        .where(and(
          inArray(pushNotificationOutboxTable.status, ["delivered", "dead"]),
          lte(pushNotificationOutboxTable.updatedAt, before),
        ))
        .orderBy(asc(pushNotificationOutboxTable.updatedAt))
        .limit(limit);
      if (terminal.length === 0) {
        return 0;
      }
      await database
        .delete(pushNotificationOutboxTable)
        .where(inArray(pushNotificationOutboxTable.id, terminal.map(({ id }) => id)));
      return terminal.length;
    },
    claimReceiptBatch,
    claimSendBatch,
    disableInstallation: async (installationId) => {
      await database.transaction(async (transaction) => {
        await transaction
          .update(pushNotificationDeliveriesTable)
          .set({ lastError: "Push token is no longer active", status: "dead" })
          .where(and(
            eq(pushNotificationDeliveriesTable.installationId, installationId),
            inArray(
              pushNotificationDeliveriesTable.status,
              ["pending", "processing", "receipt_pending"],
            ),
          ));
        await transaction
          .update(deviceInstallationsTable)
          .set({ enabled: false, pushToken: null })
          .where(eq(deviceInstallationsTable.id, installationId));
      });
    },
    markDead: async (deliveryId, error) => {
      await database
        .update(pushNotificationDeliveriesTable)
        .set({ lastError: error, status: "dead" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, deliveryId),
          eq(pushNotificationDeliveriesTable.status, "processing"),
        ));
    },
    markDelivered: async (deliveryId, deliveredAt) => {
      await database
        .update(pushNotificationDeliveriesTable)
        .set({ deliveredAt, lastError: null, status: "delivered" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, deliveryId),
          eq(pushNotificationDeliveriesTable.status, "processing"),
        ));
    },
    markReceiptPending: async (deliveryId, receiptId, checkAt) => {
      await database
        .update(pushNotificationDeliveriesTable)
        .set({ lastError: null, nextAttemptAt: checkAt, receiptId, status: "receipt_pending" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, deliveryId),
          eq(pushNotificationDeliveriesTable.status, "processing"),
        ));
    },
    materializeNotifications,
    reconcileNotifications,
    retryDelivery: async (deliveryId, attempts, error, nextAttemptAt) => {
      await database
        .update(pushNotificationDeliveriesTable)
        .set({ attempts, lastError: error, nextAttemptAt, status: "pending" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, deliveryId),
          eq(pushNotificationDeliveriesTable.status, "processing"),
        ));
    },
    retryReceipt: async (deliveryId, attempts, error, nextAttemptAt) => {
      await database
        .update(pushNotificationDeliveriesTable)
        .set({ attempts, lastError: error, nextAttemptAt, status: "receipt_pending" })
        .where(and(
          eq(pushNotificationDeliveriesTable.id, deliveryId),
          eq(pushNotificationDeliveriesTable.status, "processing"),
        ));
    },
  };
};

export { createPushOutboxRepository };
