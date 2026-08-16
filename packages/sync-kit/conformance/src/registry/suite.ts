import type { Capabilities, ProviderId } from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId } from "../case-id";
import type { SkippedCase } from "../report";
import type { ConformanceCase } from "./case";

interface CaseSelection<Provider extends ProviderId = ProviderId> {
  readonly selected: readonly ConformanceCase<Provider>[];
  readonly skipped: readonly SkippedCase[];
}

const selectConformanceCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): CaseSelection<Provider> => {
  throw new Error(`unimplemented: selectConformanceCases(${supports.provider})`);
};

const conformanceCaseOf = <Provider extends ProviderId>(
  id: ConformanceCaseId,
  supports: Capabilities<Provider>,
): ConformanceCase<Provider> => {
  throw new Error(`unimplemented: conformanceCaseOf(${id}, ${supports.provider})`);
};

export { conformanceCaseOf, selectConformanceCases };
export type { CaseSelection };
