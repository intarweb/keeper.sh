interface AttemptBudget {
  readonly claim: () => boolean;
  readonly spent: () => number;
  readonly remaining: () => number;
}

const createAttemptBudget = (maxAttempts: number): AttemptBudget => {
  const ceiling = Math.max(0, maxAttempts);
  let spent = 0;
  return {
    claim: () => {
      if (spent >= ceiling) {
        return false;
      }
      spent += 1;
      return true;
    },
    spent: () => spent,
    remaining: () => Math.max(0, ceiling - spent),
  };
};

export { createAttemptBudget };
export type { AttemptBudget };
