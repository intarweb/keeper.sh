interface CoverageDecision {
  readonly collectionPath: string;
  readonly resourcePaths: readonly string[];
}

interface DecisionRecord {
  readonly recordCoverage: (decision: CoverageDecision) => void;
  readonly recordAttempts: (spent: number, allowed: number) => void;
  readonly coverageCameFromOneCollection: () => boolean;
  readonly attemptsWithinBudget: () => boolean;
}

const allUnder = (collectionPath: string, resourcePaths: readonly string[]): boolean =>
  resourcePaths.every((path) => path.startsWith(collectionPath));

const createDecisionRecord = (): DecisionRecord => {
  let coverage: CoverageDecision | null = null;
  let overspent = false;

  return {
    recordCoverage: (decision: CoverageDecision) => {
      coverage = decision;
    },
    recordAttempts: (spent: number, allowed: number) => {
      overspent = overspent || spent > allowed;
    },
    coverageCameFromOneCollection: () => {
      if (coverage === null) {
        return true;
      }
      return allUnder(coverage.collectionPath, coverage.resourcePaths);
    },
    attemptsWithinBudget: () => !overspent,
  };
};

export { createDecisionRecord };
export type { CoverageDecision, DecisionRecord };
