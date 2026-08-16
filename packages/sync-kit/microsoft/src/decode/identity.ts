import type { DeleteHandle, EventUid, RemoteEventId, RemoteVersion } from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

interface EventIdentity {
  readonly id: RemoteEventId;
  readonly deleteHandle: DeleteHandle;
  readonly uid: EventUid;
  readonly version: RemoteVersion;
  readonly seriesMasterId: RemoteEventId | null;
}

type IdentityReading =
  | { readonly kind: "identified"; readonly identity: EventIdentity }
  | { readonly kind: "missingIdentity" };

const readIdentity = (event: GraphEvent): IdentityReading => unimplemented(event);

export { readIdentity };
export type { EventIdentity, IdentityReading };
