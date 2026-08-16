import { unimplemented } from "../unimplemented";

const graphLifecycleEvents = [
  "reauthorizationRequired",
  "subscriptionRemoved",
  "missed",
] as const;

type GraphLifecycleEvent = (typeof graphLifecycleEvents)[number];

const cursorEffects = ["keep", "reset"] as const;
type CursorEffect = (typeof cursorEffects)[number];

interface LifecycleOutcome {
  readonly event: GraphLifecycleEvent;
  readonly schedulesIngest: boolean;
  readonly cursorEffect: CursorEffect;
  readonly marksChannel: "reauthorizationRequired" | "removed" | "unchanged";
}

const lifecycleOutcomeOf = (event: GraphLifecycleEvent): LifecycleOutcome =>
  unimplemented(event);

const readLifecycleEvent = (presented: unknown): GraphLifecycleEvent | null =>
  unimplemented(presented);

export { cursorEffects, graphLifecycleEvents, lifecycleOutcomeOf, readLifecycleEvent };
export type { CursorEffect, GraphLifecycleEvent, LifecycleOutcome };
