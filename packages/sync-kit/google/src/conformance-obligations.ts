import type { ProviderConformanceSuite } from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "./dependencies";
import type { RequestSeam } from "./client/request";
import type { Semaphore } from "./client/semaphore";
import { unimplemented } from "./unimplemented";

interface ObligationSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
  readonly permits: Semaphore;
  readonly inFlightKeys: () => readonly string[];
}

const googleConformanceObligations = (
  surroundings: ObligationSurroundings,
): ProviderConformanceSuite => unimplemented(surroundings);

export { googleConformanceObligations };
export type { ObligationSurroundings };
