import type { ListingScope } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const listingModes = ["snapshot", "delta"] as const;
type ListingMode = (typeof listingModes)[number];

const requestShapeFingerprint = (
  scope: ListingScope,
  mode: ListingMode,
  hash: (input: string) => string,
): string => unimplemented(scope, mode, hash);

export { listingModes, requestShapeFingerprint };
export type { ListingMode };
