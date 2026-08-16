import type { calendar_v3 } from "@googleapis/calendar";
import type { RecurrenceAnchor, RecurrencePayload, WithholdReason } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

type DecodedRecurrence =
  | { readonly kind: "none" }
  | {
      readonly kind: "recurring";
      readonly payload: RecurrencePayload;
      readonly anchor: RecurrenceAnchor;
    }
  | { readonly kind: "undecodable"; readonly reason: WithholdReason };

const decodeRecurrence = (item: calendar_v3.Schema$Event): DecodedRecurrence => unimplemented(item);

export { decodeRecurrence };
export type { DecodedRecurrence };
