import type {
  IdempotencyKey,
  OperationContext,
  RemoteEventId,
  WritableCalendar,
} from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import type { MicrosoftFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";
import type { WriteSurroundings } from "./surroundings";

type RemoteRead =
  | { readonly kind: "found"; readonly event: GraphEvent }
  | { readonly kind: "absent" }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure };

const readRemoteEvent = (
  calendar: WritableCalendar,
  target: RemoteEventId,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<RemoteRead> => unimplemented(calendar, target, context, surroundings);

const findByIdempotencyKey = (
  calendar: WritableCalendar,
  key: IdempotencyKey,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<RemoteRead> => unimplemented(calendar, key, context, surroundings);

export { findByIdempotencyKey, readRemoteEvent };
export type { RemoteRead };
