import type { ReconciliationPolicy } from "../policy";
import type { KnownState } from "../state/known";
import type { ObservedState } from "../state/observed";
import type { CursorDecision } from "./plan";

const decideCursor = (
  observed: ObservedState,
  known: KnownState,
  policy: ReconciliationPolicy,
): CursorDecision => {
  throw new Error(`unimplemented: decideCursor(${observed.kind}, ${known.corrupt.length}, ${policy.installation.value})`);
};

export { decideCursor };
