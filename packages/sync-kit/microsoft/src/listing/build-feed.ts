import type {
  ListingScope,
  Removal,
  RemoteEvent,
  TimeWindow,
  WithheldEvent,
} from "@keeper.sh/sync-protocol";
import type { DecodedItem } from "../decode/decode-event";
import { unimplemented } from "../unimplemented";

interface FeedInputs {
  readonly items: readonly DecodedItem[];
  readonly scope: ListingScope;
  readonly walked: TimeWindow;
}

interface BuiltFeed {
  readonly events: readonly RemoteEvent[];
  readonly removals: readonly Removal[];
  readonly withheld: readonly WithheldEvent[];
  readonly selfAuthored: readonly string[];
}

const buildFeed = (inputs: FeedInputs): BuiltFeed => unimplemented(inputs);

export { buildFeed };
export type { BuiltFeed, FeedInputs };
