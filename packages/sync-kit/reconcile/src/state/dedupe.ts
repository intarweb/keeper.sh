import type { RemoteEvent } from "@keeper.sh/sync-protocol";
import type { SourceIdentity } from "../identity/source-identity";

interface IdentifiedEvent {
  readonly identity: SourceIdentity;
  readonly event: RemoteEvent;
}

interface DedupedObservations {
  readonly kept: readonly IdentifiedEvent[];
  readonly supersededKeys: readonly string[];
  readonly comparisons: number;
}

const compareObservedRevisions = (left: RemoteEvent, right: RemoteEvent): number => {
  throw new Error(`unimplemented: compareObservedRevisions(${left.id.value}, ${right.id.value})`);
};

const dedupeObservations = (observations: readonly IdentifiedEvent[]): DedupedObservations => {
  throw new Error(`unimplemented: dedupeObservations(${observations.length})`);
};

export { compareObservedRevisions, dedupeObservations };
export type { DedupedObservations, IdentifiedEvent };
