import type { OperationContext } from "@keeper.sh/sync-protocol";
import type { GoogleClock } from "../dependencies";
import type { GoogleFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";

type Attempt<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "retryable"; readonly failure: GoogleFailure }
  | { readonly kind: "fatal"; readonly failure: GoogleFailure };

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

const withBackoff = <Value>(options: BackoffOptions<Value>): Promise<BackoffOutcome<Value>> =>
  unimplemented(options);

const retryDelayMs = (
  failure: GoogleFailure,
  context: OperationContext,
  attemptNumber: number,
): number => unimplemented(failure, context, attemptNumber);

export { retryDelayMs, withBackoff };
export type { Attempt, BackoffOptions, BackoffOutcome };
