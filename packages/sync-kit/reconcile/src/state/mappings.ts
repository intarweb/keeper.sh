import type { CalendarKey, ObservedPrecondition, RemoteRef } from "@keeper.sh/sync-protocol";
import { ReconcileInternalDataError } from "../errors";
import type { MirrorFingerprint, SourceFingerprint } from "../identity/fingerprints";
import type { SourceIdentity } from "../identity/source-identity";
import { sourceIdentityKey } from "../identity/source-identity";

interface Mapping {
  readonly sourceIdentity: SourceIdentity;
  readonly sourceCalendar: CalendarKey;
  readonly destination: RemoteRef;
  readonly destinationCalendar: CalendarKey;
  readonly sourceFingerprint: SourceFingerprint;
  readonly mirrorFingerprint: MirrorFingerprint;
  readonly precondition: ObservedPrecondition;
}

interface MappingSet {
  readonly entries: readonly Mapping[];
}

interface MappingIndexes {
  readonly bySourceIdentity: ReadonlyMap<string, Mapping>;
  readonly byDestinationId: ReadonlyMap<string, Mapping>;
  readonly ambiguousSourceKeys: readonly string[];
}

const refuseDuplicateClaim = (key: string): never => {
  throw new ReconcileInternalDataError(`two mappings claim the source identity ${key}`);
};

const indexBySourceIdentity = (mappings: MappingSet): ReadonlyMap<string, Mapping> => {
  const claimed = new Map<string, Mapping>();
  for (const entry of mappings.entries) {
    const key = sourceIdentityKey(entry.sourceIdentity);
    if (claimed.has(key)) {
      return refuseDuplicateClaim(key);
    }
    claimed.set(key, entry);
  }
  return claimed;
};

const indexMappings = (mappings: MappingSet): MappingIndexes => ({
  bySourceIdentity: indexBySourceIdentity(mappings),
  byDestinationId: new Map(mappings.entries.map((entry) => [entry.destination.id.value, entry])),
  ambiguousSourceKeys: [],
});

export { indexMappings };
export type { Mapping, MappingIndexes, MappingSet };
