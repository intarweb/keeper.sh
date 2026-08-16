import type { OperationContext } from "@keeper.sh/sync-protocol";
import type { MicrosoftClock } from "../dependencies";
import type { MicrosoftFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";

type Attempt<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "retryable"; readonly failure: MicrosoftFailure }
  | { readonly kind: "fatal"; readonly failure: MicrosoftFailure }
  | { readonly kind: "aborted" };

type BackoffOutcome<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure }
  | { readonly kind: "exhausted"; readonly attempts: number }
  | { readonly kind: "aborted" };

interface BackoffOptions<Value> {
  readonly clock: MicrosoftClock;
  readonly context: OperationContext;
  readonly signal: AbortSignal;
  readonly randomFraction: () => number;
  readonly attempt: (attemptNumber: number) => Promise<Attempt<Value>>;
}

const retryDelayMs = (
  failure: MicrosoftFailure,
  options: Pick<BackoffOptions<unknown>, "clock" | "context" | "randomFraction">,
  attemptNumber: number,
): number => unimplemented(failure, options, attemptNumber);

const withBackoff = <Value>(options: BackoffOptions<Value>): Promise<BackoffOutcome<Value>> =>
  unimplemented(options);

export { retryDelayMs, withBackoff };
export type { Attempt, BackoffOptions, BackoffOutcome };
