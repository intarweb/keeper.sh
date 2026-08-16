import type { BoundedSample, ListingDiagnostics, WithheldEvent } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

interface DiagnosticsInputs {
  readonly withheld: readonly WithheldEvent[];
  readonly selfAuthored: readonly string[];
  readonly unrepresentable: readonly string[];
  readonly pagesFetched: number;
}

const boundedSample = (identifiers: readonly string[]): BoundedSample =>
  unimplemented(identifiers);

const listingDiagnostics = (inputs: DiagnosticsInputs): ListingDiagnostics =>
  unimplemented(inputs);

export { boundedSample, listingDiagnostics };
export type { DiagnosticsInputs };
