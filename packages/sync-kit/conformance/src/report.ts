import type { Capabilities } from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId, LedgerEntryId } from "./case-id";
import { ungatedCaseIdsOf } from "./registry/gates";

interface SelectedCase {
  readonly id: ConformanceCaseId;
  readonly title: string;
  readonly ledger: LedgerEntryId;
  readonly branch: string | null;
}

interface SkippedCase {
  readonly id: ConformanceCaseId;
  readonly capability: keyof Capabilities;
  readonly reason: string;
}

interface ConformanceReport {
  readonly name: string;
  readonly selected: readonly SelectedCase[];
  readonly skipped: readonly SkippedCase[];
  readonly ungated: readonly ConformanceCaseId[];
  readonly notAttempted: readonly ConformanceCaseId[];
}

const ungatedCaseIds: readonly ConformanceCaseId[] = ungatedCaseIdsOf();

export { ungatedCaseIds };
export type { ConformanceReport, SelectedCase, SkippedCase };
