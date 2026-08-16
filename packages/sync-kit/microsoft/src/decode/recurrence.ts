import type { RecurrenceAnchor, RecurrencePayload, ZoneId } from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

interface RecurrenceReading {
  readonly payload: RecurrencePayload;
  readonly anchor: RecurrenceAnchor;
}

type RecurrenceOutcome =
  | { readonly kind: "recurring"; readonly reading: RecurrenceReading }
  | { readonly kind: "single" }
  | { readonly kind: "unrepresentable" };

const readRecurrence = (event: GraphEvent, zone: ZoneId | null): RecurrenceOutcome =>
  unimplemented(event, zone);

export { readRecurrence };
export type { RecurrenceOutcome, RecurrenceReading };
