import { type } from "arktype";
import { createKeeperApi } from "@/read-models";
import { database, encryptionKey, oauthProviders, refreshLockStore } from "@/context";
import { withV1Auth, withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";

const keeperApi = createKeeperApi(database, {
  encryptionKey,
  oauthTokenRefresher: oauthProviders,
  refreshLockStore,
});

const requestSchema = type({
  "occurrenceStart?": "string",
  "sourceEventId?": "string",
  rsvpStatus: "'accepted' | 'declined' | 'tentative'",
  "+": "reject",
});

const PATCH = withWideEvent(
  withV1Auth(async ({ request, params, userId }) => {
    const { calendarId } = params;
    const sourceEventUid = params["source-event-uid"];
    if (!calendarId || !sourceEventUid) {
      return ErrorResponse.badRequest("Calendar ID and source event UID are required.")
        .toResponse();
    }
    const body = requestSchema(await request.json().catch(() => null));
    if (body instanceof type.errors) {
      return ErrorResponse.badRequest("Invalid RSVP data.").toResponse();
    }
    let occurrenceStart: Date | null = null;
    if (body.occurrenceStart) {
      occurrenceStart = new Date(body.occurrenceStart);
      if (Number.isNaN(occurrenceStart.getTime())) {
        return ErrorResponse.badRequest("Invalid occurrence start.").toResponse();
      }
    }
    const result = await keeperApi.rsvpInvite(
      userId,
      calendarId,
      sourceEventUid,
      body.sourceEventId ?? null,
      body.rsvpStatus,
      occurrenceStart,
    );
    if (!result.success) {
      return ErrorResponse.badRequest(result.error ?? "Failed to update RSVP status.")
        .toResponse();
    }
    return Response.json({ rsvpStatus: body.rsvpStatus });
  }),
);

export { PATCH };
