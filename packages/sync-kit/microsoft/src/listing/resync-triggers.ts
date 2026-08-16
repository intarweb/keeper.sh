import type { DecodedItem } from "../decode/decode-event";
import type { ListingMode } from "../cursor/fingerprint";
import { unimplemented } from "../unimplemented";

const resyncTriggers = ["gone", "seriesMasterOnDelta", "untypedRemoval"] as const;
type ResyncTrigger = (typeof resyncTriggers)[number];

type ResyncVerdict =
  | { readonly kind: "carryOn" }
  | { readonly kind: "resyncRequired"; readonly trigger: ResyncTrigger };

const resyncVerdictOf = (
  items: readonly DecodedItem[],
  mode: ListingMode,
): ResyncVerdict => unimplemented(items, mode);

export { resyncTriggers, resyncVerdictOf };
export type { ResyncTrigger, ResyncVerdict };
