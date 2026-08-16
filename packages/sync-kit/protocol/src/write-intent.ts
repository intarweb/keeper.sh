import type { CalendarKey } from "./calendar-ref";
import type {
  DeleteHandle,
  Fingerprint,
  IdempotencyKey,
  ProviderId,
  RemoteEventId,
} from "./handles";
import type { Precondition } from "./precondition";
import type { EditableContent, MirrorSource, Provenance } from "./remote-event";

interface NormalizedContent<Provider extends ProviderId = ProviderId> {
  readonly kind: "normalized";
  readonly provider: Provider;
  readonly content: EditableContent;
  readonly fingerprint: Fingerprint;
}

const deleteReasons = ["sourceDeleted", "sourceUnmapped"] as const;
type DeleteReason = (typeof deleteReasons)[number];

const retireReasons = ["outsideWindow", "destinationDisconnected"] as const;
type RetireReason = (typeof retireReasons)[number];

type WriteIntent<Provider extends ProviderId = ProviderId> =
  | {
      readonly kind: "create";
      readonly calendar: CalendarKey;
      readonly idempotencyKey: IdempotencyKey;
      readonly content: NormalizedContent<Provider>;
      readonly provenance: Extract<Provenance, { kind: "ours" }>;
      readonly precondition: Extract<Precondition, { kind: "absent" }>;
      readonly target?: never;
    }
  | {
      readonly kind: "update";
      readonly calendar: CalendarKey;
      readonly target: RemoteEventId;
      readonly content: NormalizedContent<Provider>;
      readonly precondition: Precondition;
    }
  | {
      readonly kind: "delete";
      readonly calendar: CalendarKey;
      readonly target: DeleteHandle;
      readonly precondition: Precondition;
      readonly reason: DeleteReason;
      readonly content?: never;
    }
  | {
      readonly kind: "retire";
      readonly calendar: CalendarKey;
      readonly target: DeleteHandle;
      readonly precondition: Precondition;
      readonly reason: RetireReason;
      readonly content?: never;
    };

type BuildMirrorIntent<Provider extends ProviderId = ProviderId> = (
  source: MirrorSource,
  destination: CalendarKey,
  normalized: NormalizedContent<Provider>,
) => WriteIntent<Provider>;

export { deleteReasons, retireReasons };
export type { BuildMirrorIntent, DeleteReason, NormalizedContent, RetireReason, WriteIntent };
