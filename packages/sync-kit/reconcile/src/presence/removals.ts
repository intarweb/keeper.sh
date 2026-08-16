import type { AuthoritativeRemoval, ChangeListing } from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { SourceIdentity } from "../identity/source-identity";
import type { ReconciliationPolicy } from "../policy";
import type { KnownState } from "../state/known";
import type { PresenceBasis } from "./presence-basis";

interface RemovalBasis {
  readonly explicit: readonly AuthoritativeRemoval[];
  readonly absent: readonly SourceIdentity[];
}

const emptyRemovalBasis: RemovalBasis = { explicit: [], absent: [] };

const absentWithin = (
  listing: Extract<ChangeListing, { kind: "snapshot" }>,
  known: KnownState,
  presence: PresenceBasis,
  policy: ReconciliationPolicy,
): RemovalBasis => {
  throw new Error(
    `unimplemented: absentWithin(${listing.kind}, ${known.events.length}, ${presence.presentKeys.size}, ${policy.installation.value})`,
  );
};

const namedRemovals = (listing: Extract<ChangeListing, { kind: "delta" }>): RemovalBasis => {
  throw new Error(`unimplemented: namedRemovals(${listing.removals.length})`);
};

const removalBasis = (
  listing: ChangeListing,
  known: KnownState,
  presence: PresenceBasis,
  policy: ReconciliationPolicy,
): RemovalBasis => {
  switch (listing.kind) {
    case "delta": {
      return namedRemovals(listing);
    }
    case "snapshot": {
      return absentWithin(listing, known, presence, policy);
    }
    case "partial":
    case "cursorLost": {
      return emptyRemovalBasis;
    }
    default: {
      return assertNever(listing);
    }
  }
};

export { removalBasis };
export type { RemovalBasis };
