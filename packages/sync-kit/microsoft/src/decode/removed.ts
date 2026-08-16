import type { RemoteEventId } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

type RemovedReading =
  | { readonly kind: "deleted"; readonly id: RemoteEventId }
  | { readonly kind: "cancelled"; readonly id: RemoteEventId }
  | { readonly kind: "untyped"; readonly id: RemoteEventId | null }
  | { readonly kind: "notRemoved" };

const readRemoved = (item: unknown): RemovedReading => unimplemented(item);

export { readRemoved };
export type { RemovedReading };
