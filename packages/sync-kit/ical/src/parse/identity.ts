import type { EventUid, Instant } from "@keeper.sh/sync-protocol";

type EventIdentity =
  | { readonly kind: "master"; readonly uid: EventUid }
  | { readonly kind: "override"; readonly uid: EventUid; readonly recurrenceInstant: Instant }
  | { readonly kind: "slot"; readonly uid: EventUid; readonly start: Instant; readonly end: Instant };

const eventIdentityKey = (_identity: EventIdentity): string => {
  throw new Error("unimplemented");
};

export { eventIdentityKey };
export type { EventIdentity };
