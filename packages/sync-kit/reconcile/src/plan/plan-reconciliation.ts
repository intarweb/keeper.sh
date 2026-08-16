import type { ReconciliationPolicy } from "../policy";
import type { KnownState } from "../state/known";
import type { MappingSet } from "../state/mappings";
import type { ObservedState } from "../state/observed";
import type { Plan } from "./plan";

const planReconciliation = (
  observed: ObservedState,
  known: KnownState,
  mappings: MappingSet,
  policy: ReconciliationPolicy,
): Plan => {
  throw new Error(
    `unimplemented: planReconciliation(${observed.kind}, ${known.events.length}, ${mappings.entries.length}, ${policy.installation.value})`,
  );
};

export { planReconciliation };
