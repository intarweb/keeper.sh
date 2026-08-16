import type { Instant } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";
import type { GraphSubscription } from "./subscription";

interface ReconcileInputs {
  readonly listed: readonly GraphSubscription[];
  readonly ourNotificationUrl: string;
  readonly tickStartedAt: Instant;
  readonly keep: readonly string[];
}

interface ReconcilePlan {
  readonly deletable: readonly string[];
  readonly foreign: readonly string[];
  readonly protectedByTick: readonly string[];
}

const ownsNotificationUrl = (ourUrl: string, presented: string): boolean =>
  unimplemented(ourUrl, presented);

const reconcileSubscriptions = (inputs: ReconcileInputs): ReconcilePlan => unimplemented(inputs);

export { ownsNotificationUrl, reconcileSubscriptions };
export type { ReconcileInputs, ReconcilePlan };
