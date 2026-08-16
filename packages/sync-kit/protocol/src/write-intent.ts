import type { DeleteHandle, IdempotencyKey, ProviderId, RemoteEventId } from "./handles";
import type { CalendarKey } from "./calendar-ref";
import type { EditableContent, MirrorSource, Provenance } from "./remote-event";
import type { Precondition } from "./precondition";

type NormalizedContent<Provider extends ProviderId = ProviderId> = EditableContent & {
  readonly provider?: Provider | ProviderId;
};

const deleteReasons = ["sourceDeleted", "sourceUnmapped"] as const;
type DeleteReason = (typeof deleteReasons)[number];

const retireReasons = ["outsideWindow", "destinationDisconnected"] as const;
type RetireReason = (typeof retireReasons)[number];

type WriteIntent<Provider extends ProviderId = ProviderId> =
  | {
      readonly kind: "create";
      readonly calendar: CalendarKey;
      readonly idempotencyKey?: IdempotencyKey;
      readonly content: NormalizedContent<Provider>;
      readonly provenance?: Provenance;
      readonly precondition?: Precondition;
    }
  | {
      readonly kind: "update";
      readonly calendar: CalendarKey;
      readonly target: RemoteEventId;
      readonly content: NormalizedContent<Provider>;
      readonly precondition?: Precondition;
    }
  | {
      readonly kind: "delete";
      readonly calendar: CalendarKey;
      readonly target: DeleteHandle;
      readonly precondition?: Precondition;
      readonly reason: DeleteReason;
    }
  | {
      readonly kind: "retire";
      readonly calendar: CalendarKey;
      readonly target: DeleteHandle;
      readonly precondition?: Precondition;
      readonly reason: RetireReason;
    };

type BuildMirrorIntent<Provider extends ProviderId = ProviderId> = (
  source: MirrorSource,
  destination: CalendarKey,
  normalized: NormalizedContent<Provider>,
) => WriteIntent<Provider>;

export { deleteReasons, retireReasons };
export type { BuildMirrorIntent, DeleteReason, NormalizedContent, RetireReason, WriteIntent };
