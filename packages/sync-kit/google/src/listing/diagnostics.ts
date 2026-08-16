import type { ListingDiagnostics, WithheldEvent } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

interface DiagnosticsInput {
  readonly withheld: readonly WithheldEvent[];
  readonly pagesFetched: number;
}

const listingDiagnostics = (input: DiagnosticsInput): ListingDiagnostics => unimplemented(input);

export { listingDiagnostics };
export type { DiagnosticsInput };
