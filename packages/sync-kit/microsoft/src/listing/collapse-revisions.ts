import type { WithheldEvent } from "@keeper.sh/sync-protocol";
import type { DecodedItem } from "../decode/decode-event";
import { unimplemented } from "../unimplemented";

interface ArrivedItem {
  readonly item: DecodedItem;
  readonly arrival: number;
}

interface CollapsedRevisions {
  readonly kept: readonly DecodedItem[];
  readonly withheld: readonly WithheldEvent[];
  readonly discarded: number;
}

const collapseRevisions = (arrived: readonly ArrivedItem[]): CollapsedRevisions =>
  unimplemented(arrived);

export { collapseRevisions };
export type { ArrivedItem, CollapsedRevisions };
