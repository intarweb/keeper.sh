import type { ChangeListing, RemoteEvent } from "@keeper.sh/sync-protocol";

const writeBasis = (listing: ChangeListing): readonly RemoteEvent[] => {
  throw new Error(`unimplemented: writeBasis(${listing.kind})`);
};

export { writeBasis };
