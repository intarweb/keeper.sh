import type { ChangeListing } from "@keeper.sh/sync-protocol";

interface PresenceBasis {
  readonly presentKeys: ReadonlySet<string>;
  readonly withheldKeys: ReadonlySet<string>;
}

const presenceBasis = (listing: ChangeListing): PresenceBasis => {
  throw new Error(`unimplemented: presenceBasis(${listing.kind})`);
};

export { presenceBasis };
export type { PresenceBasis };
