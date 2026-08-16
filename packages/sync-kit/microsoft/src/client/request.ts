import type { NotAttemptedReason, OperationContext, OperationName } from "@keeper.sh/sync-protocol";
import type { MicrosoftDependencies } from "../dependencies";
import type { MicrosoftFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";
import type { MailboxSemaphore } from "./semaphore";

type RequestOutcome<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

interface RequestCall<Value> {
  readonly operation: OperationName;
  readonly mailboxes: readonly string[];
  readonly context: OperationContext;
  readonly send: (signal: AbortSignal) => Promise<Value>;
}

interface RequestSeam {
  readonly send: <Value>(call: RequestCall<Value>) => Promise<RequestOutcome<Value>>;
  readonly attemptsSpent: () => number;
  readonly attemptsAllowed: () => number;
}

interface RequestSeamOptions {
  readonly dependencies: MicrosoftDependencies;
  readonly permits: MailboxSemaphore;
}

const createRequestSeam = (options: RequestSeamOptions): RequestSeam => unimplemented(options);

export { createRequestSeam };
export type { RequestCall, RequestOutcome, RequestSeam, RequestSeamOptions };
