import type { OperationContext } from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { GoogleClock } from "../dependencies";
import type { GoogleFailure } from "../errors/classify";

type Attempt<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "retryable"; readonly failure: GoogleFailure }
  | { readonly kind: "fatal"; readonly failure: GoogleFailure }
  | { readonly kind: "aborted" };

interface BackoffOptions<Value> {
  readonly clock: GoogleClock;
  readonly context: OperationContext;
  readonly signal: AbortSignal;
  readonly attempt: (attemptNumber: number) => Promise<Attempt<Value>>;
}

type BackoffOutcome<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "failed"; readonly failure: GoogleFailure }
  | { readonly kind: "exhausted"; readonly attempts: number }
  | { readonly kind: "aborted" };

const backoffStepMs = 100;

const exponentialMs = (attemptNumber: number): number => backoffStepMs * 2 ** (attemptNumber - 1);

const askedDelayMs = (
  failure: GoogleFailure,
  clock: GoogleClock,
  attemptNumber: number,
): number => {
  if (failure.kind !== "rateLimited" || failure.retryAfter === null) {
    return exponentialMs(attemptNumber);
  }
  return Date.parse(failure.retryAfter.value) - Date.parse(clock.now().value);
};

const retryDelayMs = (
  failure: GoogleFailure,
  options: Pick<BackoffOptions<unknown>, "clock" | "context">,
  attemptNumber: number,
): number => {
  const ceiling = options.context.retryBudget.retryDelayCeilingMs;
  return Math.max(0, Math.min(ceiling, askedDelayMs(failure, options.clock, attemptNumber)));
};

const sleptBetweenAttempts = async (
  milliseconds: number,
  options: BackoffOptions<unknown>,
): Promise<boolean> => {
  try {
    await options.clock.sleep(milliseconds, options.signal);
    return true;
  } catch {
    return false;
  }
};

const withBackoff = async <Value>(
  options: BackoffOptions<Value>,
): Promise<BackoffOutcome<Value>> => {
  const ceiling = options.context.retryBudget.maxAttempts;
  for (let attemptNumber = 1; attemptNumber <= ceiling; attemptNumber += 1) {
    if (options.signal.aborted) {
      return { kind: "aborted" };
    }
    const attempted = await options.attempt(attemptNumber);
    switch (attempted.kind) {
      case "answered": {
        return { kind: "answered", value: attempted.value };
      }
      case "fatal": {
        return { kind: "failed", failure: attempted.failure };
      }
      case "aborted": {
        return { kind: "aborted" };
      }
      case "retryable": {
        if (attemptNumber === ceiling) {
          return { kind: "failed", failure: attempted.failure };
        }
        const slept = await sleptBetweenAttempts(
          retryDelayMs(attempted.failure, options, attemptNumber),
          options,
        );
        if (!slept) {
          return { kind: "aborted" };
        }
        break;
      }
      default: {
        return assertNever(attempted);
      }
    }
  }
  return { kind: "exhausted", attempts: ceiling };
};

export { retryDelayMs, withBackoff };
export type { Attempt, BackoffOptions, BackoffOutcome };
