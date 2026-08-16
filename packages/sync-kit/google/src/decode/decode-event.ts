import type { calendar_v3 } from "@googleapis/calendar";
import type {
  Availability,
  EventTime,
  EventUid,
  Instant,
  RecurrenceAnchor,
  RecurrencePayload,
  RemoteEventId,
  RemoteVersion,
  Visibility,
  WithholdReason,
} from "@keeper.sh/sync-protocol";
import type { DecodedTime } from "./event-time";
import { unimplemented } from "../unimplemented";

interface EventPatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly availability?: Availability;
  readonly visibility?: Visibility;
  readonly time?: EventTime;
  readonly recurrence?: RecurrencePayload;
  readonly anchor?: RecurrenceAnchor;
  readonly uid?: EventUid;
  readonly version?: RemoteVersion;
  readonly updated?: Instant;
}

type DecodedItem =
  | { readonly kind: "cancelled"; readonly id: RemoteEventId; readonly uid: EventUid | null }
  | { readonly kind: "patch"; readonly id: RemoteEventId; readonly fields: EventPatch }
  | {
      readonly kind: "undecodable";
      readonly id: RemoteEventId | null;
      readonly uid: EventUid | null;
      readonly reason: WithholdReason;
    };

type TimeDecoder = (
  start: calendar_v3.Schema$EventDateTime | null | undefined,
  end: calendar_v3.Schema$EventDateTime | null | undefined,
) => DecodedTime;

const decodeEvent = (
  item: calendar_v3.Schema$Event,
  decodeTime: TimeDecoder,
): DecodedItem => unimplemented(item, decodeTime);

export { decodeEvent };
export type { DecodedItem, EventPatch, TimeDecoder };
