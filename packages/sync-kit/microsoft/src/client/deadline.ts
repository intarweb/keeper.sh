import type { NotAttemptedReason, OperationContext } from "@keeper.sh/sync-protocol";
import type { MicrosoftClock } from "../dependencies";
import { unimplemented } from "../unimplemented";

interface MergedSignal {
  readonly signal: AbortSignal;
  readonly release: () => void;
}

type Raced<Value> =
  | { readonly kind: "settled"; readonly value: Value }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

const mergeSignals = (signals: readonly AbortSignal[]): MergedSignal => unimplemented(signals);

const remainingMilliseconds = (context: OperationContext, clock: MicrosoftClock): number =>
  Date.parse(context.deadline.value) - Date.parse(clock.now().value);

const raceDeadline = <Value>(
  context: OperationContext,
  clock: MicrosoftClock,
  execute: (signal: AbortSignal) => Promise<Value>,
): Promise<Raced<Value>> => unimplemented(context, clock, execute);

export { mergeSignals, raceDeadline, remainingMilliseconds };
export type { MergedSignal, Raced };
