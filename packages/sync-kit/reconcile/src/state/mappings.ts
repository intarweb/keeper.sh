import type { CalendarKey, ObservedPrecondition, RemoteRef } from "@keeper.sh/sync-protocol";
import type { MirrorFingerprint, SourceFingerprint } from "../identity/fingerprints";
import type { SourceIdentity } from "../identity/source-identity";

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

const indexMappings = (mappings: MappingSet): MappingIndexes => {
  throw new Error(`unimplemented: indexMappings(${mappings.entries.length})`);
};

export { indexMappings };
export type { Mapping, MappingIndexes, MappingSet };
