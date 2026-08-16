import type { EventUid, RepresentabilityConstraint, ZoneId } from "@keeper.sh/sync-protocol";
import type { CanonicalEvent } from "../canonical/canonical-event";
import type { IcsOptions } from "../options";

interface RecurrenceSet {
  readonly master: CanonicalEvent;
  readonly overrides: readonly CanonicalEvent[];
}

type SerialisedResource =
  | { readonly kind: "resource"; readonly text: string; readonly zones: readonly ZoneId[] }
  | { readonly kind: "refused"; readonly constraint: RepresentabilityConstraint }
  | { readonly kind: "uidMismatch"; readonly master: EventUid; readonly override: EventUid };

const serialiseCalendarResource = (
  _set: RecurrenceSet,
  _options: IcsOptions): SerialisedResource => {
  throw new Error("unimplemented");
};

export { serialiseCalendarResource };
export type { RecurrenceSet, SerialisedResource };
