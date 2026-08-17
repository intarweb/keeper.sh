import { type } from "arktype";
import { nativeOAuth } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";

const bodySchema = type({ ticket: "string", "+": "reject" }).narrow(
  (value, context) => {
    if (value.ticket.length > 0 && value.ticket.length <= 1024) {
      return true;
    }
    return context.mustBe("a non-empty OAuth ticket no longer than 1024 characters");
  },
);

const POST = withWideEvent(
  withAuth(async ({ request, sessionId, userId }) => {
    const body = bodySchema(await request.json().catch(() => null));
    if (body instanceof type.errors) {
      return ErrorResponse.badRequest("Invalid request body").toResponse();
    }
    const result = await nativeOAuth.redeemTicket(body.ticket, { sessionId, userId });
    if (!result) {
      return ErrorResponse.badRequest("Invalid, expired, or already redeemed OAuth ticket")
        .toResponse();
    }
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  }),
);

export { POST };
