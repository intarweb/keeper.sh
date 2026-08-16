import type { DeleteHandle } from "@keeper.sh/sync-protocol";
import type { ProvenCoverage } from "../coverage";
import { insideProvenCoverage } from "../coverage";
import { sourceIdentityKey } from "../identity/source-identity";
import type { ReconciliationPolicy } from "../policy";
import type { RemovalBasis } from "../presence/removals";
import type { KnownEvent, KnownIndex, KnownState } from "../state/known";
import type { MappingIndexes } from "../state/mappings";
import type { MirrorIndex } from "../state/mirrors";
import type { Tombstone, Unresolved } from "./plan";

interface TombstoneInput {
  readonly removals: RemovalBasis;
  readonly known: KnownState;
  readonly knownIndex: KnownIndex;
  readonly indexes: MappingIndexes;
  readonly mirrors: MirrorIndex;
  readonly coverage: ProvenCoverage;
  readonly reassignedKeys: readonly string[];
  readonly retireOutsideMirrorWindow: boolean;
  readonly policy: ReconciliationPolicy;
}

interface TombstoneDerivation {
  readonly tombstones: readonly Tombstone[];
  readonly unresolved: readonly Unresolved[];
}

const handleFor = (event: KnownEvent, input: TombstoneInput): DeleteHandle | null => {
  const mapping = input.indexes.bySourceIdentity.get(sourceIdentityKey(event.identity));
  if (!mapping) {
    return null;
  }
  return (
    input.mirrors.byId.get(mapping.destination.id.value)?.deleteHandle ??
    mapping.destination.deleteHandle
  );
};

const retiredByTheMirrorWindow = (event: KnownEvent, input: TombstoneInput): boolean => {
  if (!input.retireOutsideMirrorWindow) {
    return false;
  }
  if (event.recurring) {
    return false;
  }
  if (!input.indexes.bySourceIdentity.has(sourceIdentityKey(event.identity))) {
    return false;
  }
  return !input.policy.withinWindow(input.policy.mirrorWindow, event.time);
};

const absenceIsProven = (event: KnownEvent, input: TombstoneInput): boolean => {
  if (input.coverage.kind === "unproven") {
    return false;
  }
  if (event.recurring) {
    return true;
  }
  return insideProvenCoverage(input.coverage, event.time, input.policy.withinWindow);
};

const corruptRowsReported = (known: KnownState): readonly Unresolved[] =>
  known.corrupt.map((row) => ({ identity: null, id: row.id, reason: "corruptKnownState" }));

const rowsNamedBy = (input: TombstoneInput): readonly KnownEvent[] =>
  input.removals.explicit.flatMap((removal) => input.knownIndex.byUid.get(removal.uid.value) ?? []);

const rowsAbsentFrom = (input: TombstoneInput): readonly KnownEvent[] =>
  input.removals.absent.flatMap((identity) => {
    const row = input.knownIndex.byIdentity.get(sourceIdentityKey(identity));
    if (!row) {
      return [];
    }
    return [row];
  });

const deriveTombstones = (input: TombstoneInput): TombstoneDerivation => {
  if (input.known.corrupt.length > 0) {
    return { tombstones: [], unresolved: corruptRowsReported(input.known) };
  }
  const claimed = new Set<string>(input.reassignedKeys);
  const tombstones: Tombstone[] = [];
  const unresolved: Unresolved[] = [];
  for (const event of input.known.events) {
    if (!retiredByTheMirrorWindow(event, input)) {
      continue;
    }
    claimed.add(sourceIdentityKey(event.identity));
    tombstones.push({
      identity: event.identity,
      cause: "outsideMirrorWindow",
      handle: handleFor(event, input),
    });
  }
  for (const event of rowsNamedBy(input)) {
    const key = sourceIdentityKey(event.identity);
    if (claimed.has(key)) {
      continue;
    }
    claimed.add(key);
    tombstones.push({
      identity: event.identity,
      cause: "explicitRemoval",
      handle: handleFor(event, input),
    });
  }
  for (const event of rowsAbsentFrom(input)) {
    const key = sourceIdentityKey(event.identity);
    if (claimed.has(key)) {
      continue;
    }
    claimed.add(key);
    if (!absenceIsProven(event, input)) {
      unresolved.push({
        identity: event.identity,
        id: null,
        reason: "outsideProvenCoverage",
      });
      continue;
    }
    tombstones.push({
      identity: event.identity,
      cause: "absentFromSnapshot",
      handle: handleFor(event, input),
    });
  }
  return { tombstones, unresolved };
};

export { deriveTombstones };
export type { TombstoneDerivation, TombstoneInput };
