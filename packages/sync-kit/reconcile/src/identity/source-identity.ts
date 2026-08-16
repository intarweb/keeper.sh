import type { EventIdentity } from "@keeper.sh/sync-ical";

type SourceIdentity = EventIdentity;

const sourceIdentityKey = (identity: SourceIdentity): string => {
  throw new Error(`unimplemented: sourceIdentityKey(${identity.kind})`);
};

export { sourceIdentityKey };
export type { SourceIdentity };
