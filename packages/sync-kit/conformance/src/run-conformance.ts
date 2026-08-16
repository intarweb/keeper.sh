import type { ProviderId } from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId, LedgerEntryId } from "./case-id";
import type { RunConformanceOptions } from "./options";
import type { ConformanceReport } from "./report";

interface PlannedCase {
  readonly id: ConformanceCaseId;
  readonly title: string;
  readonly ledger: LedgerEntryId;
  readonly branch: string | null;
  readonly execute: () => Promise<void>;
}

interface ConformanceRunPlan {
  readonly report: ConformanceReport;
  readonly cases: readonly PlannedCase[];
}

const planConformanceRun = <Provider extends ProviderId>(
  options: RunConformanceOptions<Provider>,
): ConformanceRunPlan => {
  throw new Error(`unimplemented: planConformanceRun(${options.name})`);
};

const runConformance = <Provider extends ProviderId>(
  options: RunConformanceOptions<Provider>,
): ConformanceReport => {
  throw new Error(`unimplemented: runConformance(${options.name})`);
};

export { planConformanceRun, runConformance };
export type { ConformanceRunPlan, PlannedCase };
