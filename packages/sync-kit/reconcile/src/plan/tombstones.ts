import type { ReconciliationPolicy } from "../policy";
import type { RemovalBasis } from "../presence/removals";
import type { KnownState } from "../state/known";
import type { MappingIndexes } from "../state/mappings";
import type { Tombstone, Unresolved } from "./plan";

interface TombstoneDerivation {
  readonly tombstones: readonly Tombstone[];
  readonly unresolved: readonly Unresolved[];
}

const deriveTombstones = (
  removals: RemovalBasis,
  known: KnownState,
  indexes: MappingIndexes,
  policy: ReconciliationPolicy,
): TombstoneDerivation => {
  throw new Error(
    `unimplemented: deriveTombstones(${removals.explicit.length}, ${removals.absent.length}, ${known.events.length}, ${indexes.bySourceIdentity.size}, ${policy.installation.value})`,
  );
};

export { deriveTombstones };
export type { TombstoneDerivation };
