import type { RemoteEvent } from "@keeper.sh/sync-protocol";
import type { SourceIdentity } from "../identity/source-identity";
import { sourceIdentityKey } from "../identity/source-identity";
import { rankOfRevision } from "./revision";

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
  const leftRank = rankOfRevision(left.revision);
  const rightRank = rankOfRevision(right.revision);
  if (leftRank === rightRank) {
    return 0;
  }
  if (leftRank < rightRank) {
    return -1;
  }
  return 1;
};

const dedupeObservations = (observations: readonly IdentifiedEvent[]): DedupedObservations => {
  const winners = new Map<string, IdentifiedEvent>();
  const supersededKeys: string[] = [];
  let comparisons = 0;
  for (const observation of observations) {
    const key = sourceIdentityKey(observation.identity);
    const incumbent = winners.get(key);
    if (!incumbent) {
      winners.set(key, observation);
      continue;
    }
    comparisons += 1;
    supersededKeys.push(key);
    if (compareObservedRevisions(observation.event, incumbent.event) > 0) {
      winners.set(key, observation);
    }
  }
  return { kept: [...winners.values()], supersededKeys, comparisons };
};

export { compareObservedRevisions, dedupeObservations };
export type { DedupedObservations, IdentifiedEvent };
