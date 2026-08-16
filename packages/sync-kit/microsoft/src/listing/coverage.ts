import type { CoverageWindow, ListingScope, TimeWindow } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const provenCoverage = (scope: ListingScope, walked: TimeWindow): CoverageWindow =>
  unimplemented(scope, walked);

export { provenCoverage };
