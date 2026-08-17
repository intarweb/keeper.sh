import { withAuth, withWideEvent } from "@/utils/middleware";
import { premiumService } from "@/context";
import { resolveSharedEventGrant } from "@/utils/source-destination-mappings";
import { handlePatchSharedEventGrantRoute } from "../../mapping-routes";

const PATCH = withWideEvent(
  withAuth(async ({ request, params, userId }) => {
    const payload = await request.json();
    return handlePatchSharedEventGrantRoute(
      {
        body: payload,
        params: { destinationId: params.destination ?? "", id: params.id ?? "" },
        userId,
      },
      {
        canUseTwoWaySync: (candidateUserId) =>
          premiumService.canUseTwoWaySync(candidateUserId),
        resolveSharedEventGrant,
      },
    );
  }),
);

export { PATCH };
