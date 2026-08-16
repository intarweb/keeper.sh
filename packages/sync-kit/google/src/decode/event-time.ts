import type { calendar_v3 } from "@googleapis/calendar";
import type { EventTime, WithholdReason, ZoneId } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

type DecodedTime =
  | { readonly kind: "time"; readonly time: EventTime }
  | { readonly kind: "undecodable"; readonly reason: WithholdReason };

const decodeEventTime = (
  start: calendar_v3.Schema$EventDateTime | null | undefined,
  end: calendar_v3.Schema$EventDateTime | null | undefined,
): DecodedTime => unimplemented(start, end);

const decodeZoneId = (value: string | null | undefined): ZoneId | null => unimplemented(value);

export { decodeEventTime, decodeZoneId };
export type { DecodedTime };
