import type { ChangeListing, KnownEvents, WindowMembership } from "@keeper.sh/sync-protocol";

interface RemovalBasis {
  readonly listing: ChangeListing;
  readonly known: KnownEvents;
  readonly withinWindow: WindowMembership;
}

const assertNoRemovalDerivable = (listing: ChangeListing): void => {
  throw new Error(`unimplemented: assertNoRemovalDerivable(${listing.kind})`);
};

const derivableRemovals = (basis: RemovalBasis): readonly string[] => {
  throw new Error(`unimplemented: derivableRemovals(${basis.listing.kind})`);
};

export { assertNoRemovalDerivable, derivableRemovals };
export type { RemovalBasis };
