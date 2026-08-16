import type { PlanLimits } from "../policy";
import type { IdentifiedEvent } from "../state/dedupe";
import type { Mapping } from "../state/mappings";

interface Reassignment {
  readonly mapping: Mapping;
  readonly observation: IdentifiedEvent;
}

interface ReassignmentPairing {
  readonly reassignments: readonly Reassignment[];
  readonly unpairedObservations: readonly IdentifiedEvent[];
  readonly unpairedMappings: readonly Mapping[];
  readonly comparisons: number;
  readonly refused: boolean;
}

const pairReassignedOccurrences = (
  observations: readonly IdentifiedEvent[],
  orphanedMappings: readonly Mapping[],
  limits: PlanLimits,
): ReassignmentPairing => {
  throw new Error(
    `unimplemented: pairReassignedOccurrences(${observations.length}, ${orphanedMappings.length}, ${limits.reassignmentPairingWidth})`,
  );
};

export { pairReassignedOccurrences };
export type { Reassignment, ReassignmentPairing };
