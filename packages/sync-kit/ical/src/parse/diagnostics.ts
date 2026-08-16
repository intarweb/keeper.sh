import type { ListingDiagnostics } from "@keeper.sh/sync-protocol";
import type { IcsLimits } from "../options";
import type { VeventOutcome } from "./parse-vevent";

const toListingDiagnostics = (
  _outcomes: readonly VeventOutcome[],
  _limits: IcsLimits): ListingDiagnostics => {
  throw new Error("unimplemented");
};

export { toListingDiagnostics };
