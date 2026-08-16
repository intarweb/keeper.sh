import type { Instant, ProviderId } from "@keeper.sh/sync-protocol";
import { describe, it } from "vitest";
import type { ConformanceCaseId, LedgerEntryId } from "./case-id";
import { createConformanceEnvironment } from "./environment";
import type { RunConformanceOptions } from "./options";
import type { ConformanceReport } from "./report";
import { ungatedCaseIds } from "./report";
import { branchNameOf } from "./registry/gates";
import { selectConformanceCases } from "./registry/suite";

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

const suiteStart: Instant = { kind: "instant", value: "2026-03-11T00:00:00.000Z" };

const conformanceHash = (input: string): string => {
  let accumulated = 0;
  for (const character of input) {
    accumulated = (accumulated * 31 + (character.codePointAt(0) ?? 0)) % 2_147_483_647;
  }
  return accumulated.toString(16).padStart(8, "0");
};

const planConformanceRun = <Provider extends ProviderId>(
  options: RunConformanceOptions<Provider>,
): ConformanceRunPlan => {
  const selection = selectConformanceCases(options.supports);
  const cases = selection.selected.map((record) => ({
    id: record.id,
    title: record.title,
    ledger: record.ledger,
    branch: branchNameOf(record.gate),
    execute: async (): Promise<void> => {
      const environment = createConformanceEnvironment({
        start: suiteStart,
        installation: { kind: "installationId", value: `conformance-${options.name}` },
        hash: conformanceHash,
      });
      const provider = await options.create(environment);
      try {
        await record.run({
          provider,
          environment,
          supports: options.supports,
          withinWindow: options.withinWindow,
        });
      } finally {
        await provider.dispose();
      }
    },
  }));
  return {
    report: {
      name: options.name,
      selected: cases.map((planned) => ({
        id: planned.id,
        title: planned.title,
        ledger: planned.ledger,
        branch: planned.branch,
      })),
      skipped: selection.skipped,
      ungated: ungatedCaseIds,
      notAttempted: [],
    },
    cases,
  };
};

const runConformance = <Provider extends ProviderId>(
  options: RunConformanceOptions<Provider>,
): ConformanceReport => {
  const plan = planConformanceRun(options);
  describe(`conformance: ${options.name}`, () => {
    for (const planned of plan.cases) {
      it(planned.title, () => planned.execute());
    }
  });
  return plan.report;
};

export { planConformanceRun, runConformance };
export type { ConformanceRunPlan, PlannedCase };
