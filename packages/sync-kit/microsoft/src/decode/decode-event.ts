import type {
  CalendarKey,
  InstallationId,
  RemoteEvent,
  WithheldIdentity,
  WithholdReason,
} from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "@keeper.sh/sync-ical";
import { unimplemented } from "../unimplemented";
import type { ListingMode } from "../cursor/fingerprint";
import type { GraphEventType } from "./event-type";
import type { RemovedReading } from "./removed";

interface DecodeSurroundings {
  readonly calendar: CalendarKey;
  readonly installation: InstallationId;
  readonly zones: ZoneCache;
  readonly hash: (input: string) => string;
  readonly mode: ListingMode;
}

interface DecodedFields {
  readonly lastModifiedDateTime: string | null;
  readonly createdDateTime: string | null;
}

type DecodedItem =
  | {
      readonly kind: "decoded";
      readonly event: RemoteEvent;
      readonly type: GraphEventType;
      readonly fields: DecodedFields;
    }
  | { readonly kind: "tombstone"; readonly removal: RemovedReading }
  | {
      readonly kind: "undecodable";
      readonly identity: WithheldIdentity;
      readonly reason: WithholdReason;
    };

const decodeGraphItem = (item: unknown, surroundings: DecodeSurroundings): DecodedItem =>
  unimplemented(item, surroundings);

export { decodeGraphItem };
export type { DecodedFields, DecodedItem, DecodeSurroundings };
