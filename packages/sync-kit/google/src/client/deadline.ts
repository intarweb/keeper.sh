import type { NotAttemptedReason, OperationContext } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

interface MergedSignal {
  readonly signal: AbortSignal;
  readonly release: () => void;
}

type Raced<Value> =
  | { readonly kind: "settled"; readonly value: Value }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

const mergeSignals = (signals: readonly AbortSignal[]): MergedSignal => unimplemented(signals);

const raceDeadline = <Value>(
  context: OperationContext,
  execute: (signal: AbortSignal) => Promise<Value>,
): Promise<Raced<Value>> => unimplemented(context, execute);

export { mergeSignals, raceDeadline };
export type { MergedSignal, Raced };
