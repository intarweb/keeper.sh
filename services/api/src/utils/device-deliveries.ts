import { pushNotificationDeliveriesTable } from "@keeper.sh/database/schema";
import { and, inArray } from "drizzle-orm";
import type { database as ContextDatabase } from "@/context";

type DeviceDeliveryDatabase = Pick<typeof ContextDatabase, "update">;

const cancelOutstandingDeviceDeliveries = async (
  database: DeviceDeliveryDatabase,
  installationIds: string[],
  reason: string,
): Promise<void> => {
  if (installationIds.length === 0) {
    return;
  }
  await database
    .update(pushNotificationDeliveriesTable)
    .set({ lastError: reason, status: "dead" })
    .where(and(
      inArray(pushNotificationDeliveriesTable.installationId, installationIds),
      inArray(
        pushNotificationDeliveriesTable.status,
        ["pending", "processing", "receipt_pending"],
      ),
    ));
};

export { cancelOutstandingDeviceDeliveries };
