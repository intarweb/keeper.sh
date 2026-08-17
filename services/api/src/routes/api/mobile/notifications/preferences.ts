import { type } from "arktype";
import {
  notificationPreferencesTable,
  pushNotificationOutboxTable,
} from "@keeper.sh/database/schema";
import { and, eq, inArray } from "drizzle-orm";
import { database } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";

const patchSchema = type({
  "invites?": "boolean",
  "reauthentication?": "boolean",
  "syncFailures?": "boolean",
  "+": "reject",
});

const readPreferences = async (userId: string) => {
  const [preferences] = await database
    .select({
      invites: notificationPreferencesTable.invites,
      reauthentication: notificationPreferencesTable.reauthentication,
      syncFailures: notificationPreferencesTable.syncFailures,
    })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);
  return preferences ?? { invites: true, reauthentication: true, syncFailures: true };
};

const GET = withWideEvent(
  withAuth(async ({ userId }) => Response.json(await readPreferences(userId))),
);

const PATCH = withWideEvent(
  withAuth(async ({ request, userId }) => {
    const body = patchSchema(await request.json().catch(() => null));
    if (body instanceof type.errors || Object.keys(body).length === 0) {
      return ErrorResponse.badRequest("Invalid notification preferences").toResponse();
    }
    const preferences = await database.transaction(async (transaction) => {
      const [updated] = await transaction
        .insert(notificationPreferencesTable)
        .values({ ...body, userId })
        .onConflictDoUpdate({ set: body, target: notificationPreferencesTable.userId })
        .returning({
          invites: notificationPreferencesTable.invites,
          reauthentication: notificationPreferencesTable.reauthentication,
          syncFailures: notificationPreferencesTable.syncFailures,
        });

      const disabledTypes: string[] = [];
      if (body.invites === false) {
        disabledTypes.push("calendar_invite");
      }
      if (body.reauthentication === false) {
        disabledTypes.push("reauthentication_required");
      }
      if (body.syncFailures === false) {
        disabledTypes.push("sync_failed");
      }
      if (disabledTypes.length > 0) {
        await transaction
          .update(pushNotificationOutboxTable)
          .set({
            lastError: "Notification preference disabled",
            status: "dead",
          })
          .where(and(
            eq(pushNotificationOutboxTable.userId, userId),
            inArray(pushNotificationOutboxTable.type, disabledTypes),
            inArray(pushNotificationOutboxTable.status, ["pending", "processing"]),
          ));
      }
      return updated;
    });
    return Response.json(preferences);
  }),
);

export { GET, PATCH };
