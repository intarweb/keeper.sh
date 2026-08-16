import type { ListingScope } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const listingModes = ["snapshot", "delta"] as const;
type ListingMode = (typeof listingModes)[number];

const adapterVersion = 1;

const requestShapeFingerprint = (
  scope: ListingScope,
  mode: ListingMode,
  hash: (input: string) => string,
): string => unimplemented(scope, mode, hash);

export { adapterVersion, listingModes, requestShapeFingerprint };
export type { ListingMode };
