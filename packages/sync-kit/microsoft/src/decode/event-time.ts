import type { EventTime, ZoneId } from "@keeper.sh/sync-protocol";
import type { DateTimeTimeZone } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

type TimeReading =
  | { readonly kind: "time"; readonly time: EventTime }
  | { readonly kind: "unrepresentable" };

interface TimeInputs {
  readonly start: DateTimeTimeZone | null;
  readonly end: DateTimeTimeZone | null;
  readonly isAllDay: boolean;
  readonly zone: ZoneId | null;
}

const decodeEventTime = (inputs: TimeInputs): TimeReading => unimplemented(inputs);

export { decodeEventTime };
export type { TimeInputs, TimeReading };
