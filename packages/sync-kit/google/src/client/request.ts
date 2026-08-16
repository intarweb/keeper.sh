import type { OperationContext, OperationName } from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "../dependencies";
import type { GoogleFailure } from "../errors/classify";
import type { Semaphore } from "./semaphore";
import { unimplemented } from "../unimplemented";

type RequestOutcome<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "failed"; readonly failure: GoogleFailure }
  | { readonly kind: "notAttempted"; readonly reason: "aborted" | "budgetExhausted" };

interface RequestSeam {
  readonly send: <Value>(
    operation: OperationName,
    context: OperationContext,
    call: (signal: AbortSignal) => Promise<Value>,
  ) => Promise<RequestOutcome<Value>>;
}

interface RequestSeamOptions {
  readonly dependencies: GoogleDependencies;
  readonly permits: Semaphore;
}

const createRequestSeam = (options: RequestSeamOptions): RequestSeam => unimplemented(options);

export { createRequestSeam };
export type { RequestOutcome, RequestSeam, RequestSeamOptions };
