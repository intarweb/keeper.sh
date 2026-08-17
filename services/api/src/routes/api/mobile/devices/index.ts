import { type } from "arktype";
import { deviceInstallationsTable } from "@keeper.sh/database/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { database } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";
import { cancelOutstandingDeviceDeliveries } from "@/utils/device-deliveries";

const registrationSchema = type({
  installationId: "string",
  platform: "'android' | 'ios'",
  "pushToken?": "string | null",
  "deviceName?": "string",
  "appVersion?": "string",
  "+": "reject",
});

const GET = withWideEvent(
  withAuth(async ({ userId }) => {
    const devices = await database
      .select({
        appVersion: deviceInstallationsTable.appVersion,
        createdAt: deviceInstallationsTable.createdAt,
        deviceName: deviceInstallationsTable.deviceName,
        enabled: deviceInstallationsTable.enabled,
        installationId: deviceInstallationsTable.installationId,
        lastSeenAt: deviceInstallationsTable.lastSeenAt,
        platform: deviceInstallationsTable.platform,
      })
      .from(deviceInstallationsTable)
      .where(eq(deviceInstallationsTable.userId, userId))
      .orderBy(asc(deviceInstallationsTable.createdAt));
    return Response.json(devices);
  }),
);

const POST = withWideEvent(
  withAuth(async ({ request, userId }) => {
    const body = registrationSchema(await request.json().catch(() => null));
    if (
      body instanceof type.errors
      || !body.installationId.trim()
      || body.installationId.length > 256
      || (body.appVersion?.length ?? 0) > 128
      || (body.deviceName?.length ?? 0) > 256
    ) {
      return ErrorResponse.badRequest("Invalid device registration").toResponse();
    }
    if (body.pushToken && body.pushToken.length > 4096) {
      return ErrorResponse.badRequest("Push token is too long").toResponse();
    }

    const device = await database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}\u0000${body.installationId}`}, 0))`,
      );
      const targetInstallations = await transaction
        .select({ id: deviceInstallationsTable.id })
        .from(deviceInstallationsTable)
        .where(and(
          eq(deviceInstallationsTable.userId, userId),
          eq(deviceInstallationsTable.installationId, body.installationId),
        ));
      const affectedInstallationIds = targetInstallations.map(({ id }) => id);

      if (body.pushToken) {
        // Expo tokens identify an app installation globally. Serialization makes
        // Registration becomes self-healing when a previous sign-out could not revoke it.
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${body.pushToken}, 0))`);
        const previousOwners = await transaction
          .select({ id: deviceInstallationsTable.id })
          .from(deviceInstallationsTable)
          .where(eq(deviceInstallationsTable.pushToken, body.pushToken));
        affectedInstallationIds.push(...previousOwners.map(({ id }) => id));
      }

      await cancelOutstandingDeviceDeliveries(
        transaction,
        [...new Set(affectedInstallationIds)],
        "Device registration replaced",
      );

      if (body.pushToken) {
        await transaction
          .update(deviceInstallationsTable)
          .set({ enabled: false, pushToken: null })
          .where(eq(deviceInstallationsTable.pushToken, body.pushToken));
      }

      const [registered] = await transaction
        .insert(deviceInstallationsTable)
        .values({
          appVersion: body.appVersion ?? null,
          deviceName: body.deviceName ?? null,
          installationId: body.installationId,
          lastSeenAt: new Date(),
          platform: body.platform,
          pushToken: body.pushToken ?? null,
          userId,
        })
        .onConflictDoUpdate({
          set: {
            appVersion: body.appVersion ?? null,
            deviceName: body.deviceName ?? null,
            enabled: true,
            lastSeenAt: new Date(),
            platform: body.platform,
            pushToken: body.pushToken ?? null,
          },
          target: [deviceInstallationsTable.userId, deviceInstallationsTable.installationId],
        })
        .returning({ installationId: deviceInstallationsTable.installationId });
      return registered;
    });

    return Response.json(device, { status: 201 });
  }),
);

export { GET, POST };
