import type { IdempotencyKey } from "@keeper.sh/sync-protocol";
import type { SourceIdentity } from "../identity/source-identity";
import type { ReconciliationPolicy } from "../policy";
import type { IdentifiedEvent } from "../state/dedupe";
import type { MappingIndexes } from "../state/mappings";
import type { Conflict, PlannedWrite, Unresolved } from "./plan";

interface WriteDerivation {
  readonly writes: readonly PlannedWrite[];
  readonly conflicts: readonly Conflict[];
  readonly unresolved: readonly Unresolved[];
}

const mirrorIdempotencyKey = (
  identity: SourceIdentity,
  policy: ReconciliationPolicy,
): IdempotencyKey => {
  throw new Error(`unimplemented: mirrorIdempotencyKey(${identity.kind}, ${policy.destination.key.provider})`);
};

const deriveWrites = (
  observations: readonly IdentifiedEvent[],
  indexes: MappingIndexes,
  policy: ReconciliationPolicy,
): WriteDerivation => {
  throw new Error(
    `unimplemented: deriveWrites(${observations.length}, ${indexes.bySourceIdentity.size}, ${policy.installation.value})`,
  );
};

export { deriveWrites, mirrorIdempotencyKey };
export type { WriteDerivation };
