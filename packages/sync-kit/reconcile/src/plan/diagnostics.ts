import type { BoundedSample } from "@keeper.sh/sync-protocol";
import type { PlanLimits } from "../policy";

const boundedSample = (values: readonly string[], limits: PlanLimits): BoundedSample => {
  throw new Error(`unimplemented: boundedSample(${values.length}, ${limits.sampleCount})`);
};

export { boundedSample };
