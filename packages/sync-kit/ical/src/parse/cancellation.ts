import type { Instant } from "@keeper.sh/sync-protocol";
import type { ParsedVevent } from "./parse-vevent";

interface CancellationResolution {
  readonly surviving: readonly ParsedVevent[];
  readonly cancellations: readonly Instant[];
}

const applyCancellations = (_events: readonly ParsedVevent[]): CancellationResolution => {
  throw new Error("unimplemented");
};

export { applyCancellations };
export type { CancellationResolution };
