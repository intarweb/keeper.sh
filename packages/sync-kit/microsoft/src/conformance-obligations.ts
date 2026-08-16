import type { ProviderConformanceSuite } from "@keeper.sh/sync-protocol";
import type { RequestSeam } from "./client/request";
import type { MailboxSemaphore } from "./client/semaphore";
import type { MicrosoftDependencies } from "./dependencies";
import { unimplemented } from "./unimplemented";

interface ObligationSurroundings {
  readonly dependencies: MicrosoftDependencies;
  readonly requests: RequestSeam;
  readonly permits: MailboxSemaphore;
  readonly inFlightKeys: () => readonly string[];
  readonly deletionCalendars: () => readonly string[];
}

const microsoftConformanceObligations = (
  surroundings: ObligationSurroundings,
): ProviderConformanceSuite => unimplemented(surroundings);

export { microsoftConformanceObligations };
export type { ObligationSurroundings };
