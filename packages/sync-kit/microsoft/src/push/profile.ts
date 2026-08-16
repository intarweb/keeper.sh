import type { Instant } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const subscriptionResources = ["events"] as const;
type SubscriptionResource = (typeof subscriptionResources)[number];

const minuteMs = 60 * 1000;

const graphLifetimeMinutes = {
  events: { basic: 10_080, withResourceData: 1440 },
} as const;

const lifetimeFloorMs = 45 * minuteMs;
const lifetimeSafetyMarginMs = 30 * minuteMs;

const subscriptionLifetimeMs = (
  resource: SubscriptionResource,
  includeResourceData: boolean,
): number => unimplemented(resource, includeResourceData);

const staggerOffsetMs = (lifetimeMs: number, randomFraction: () => number): number =>
  unimplemented(lifetimeMs, randomFraction);

const renewalInstantOf = (
  expiration: Instant,
  lifetimeMs: number,
  randomFraction: () => number,
): Instant => unimplemented(expiration, lifetimeMs, randomFraction);

const expirationInstantOf = (
  now: Instant,
  requestedMs: number,
  resource: SubscriptionResource,
  includeResourceData: boolean,
): Instant => unimplemented(now, requestedMs, resource, includeResourceData);

export {
  expirationInstantOf,
  graphLifetimeMinutes,
  lifetimeFloorMs,
  lifetimeSafetyMarginMs,
  renewalInstantOf,
  staggerOffsetMs,
  subscriptionLifetimeMs,
  subscriptionResources,
};
export type { SubscriptionResource };
