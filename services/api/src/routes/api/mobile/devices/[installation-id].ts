import { deviceInstallationsTable } from "@keeper.sh/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { database } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";
import { cancelOutstandingDeviceDeliveries } from "@/utils/device-deliveries";

const DELETE = withWideEvent(
  withAuth(async ({ params, userId }) => {
    const installationId = params["installation-id"];
    if (!installationId) {
      return ErrorResponse.badRequest("Installation ID is required").toResponse();
    }
    const disabled = await database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}\u0000${installationId}`}, 0))`,
      );
      const [installation] = await transaction
        .select({
          id: deviceInstallationsTable.id,
          pushToken: deviceInstallationsTable.pushToken,
        })
        .from(deviceInstallationsTable)
        .where(and(
          eq(deviceInstallationsTable.installationId, installationId),
          eq(deviceInstallationsTable.userId, userId),
        ))
        .limit(1);
      if (!installation) {
        return null;
      }
      if (installation.pushToken) {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${installation.pushToken}, 0))`,
        );
      }
      await cancelOutstandingDeviceDeliveries(
        transaction,
        [installation.id],
        "Device registration revoked",
      );
      const [result] = await transaction
        .update(deviceInstallationsTable)
        .set({ enabled: false, pushToken: null })
        .where(eq(deviceInstallationsTable.id, installation.id))
        .returning({ installationId: deviceInstallationsTable.installationId });
      return result ?? null;
    });
    if (!disabled) {
      return ErrorResponse.notFound("Device installation not found").toResponse();
    }
    return Response.json({ success: true });
  }),
);

export { DELETE };
