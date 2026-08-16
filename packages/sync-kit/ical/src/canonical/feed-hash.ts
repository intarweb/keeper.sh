import type { Fingerprint } from "@keeper.sh/sync-protocol";

const feedContentHash = (_body: string): Fingerprint => {
  throw new Error("unimplemented");
};

export { feedContentHash };
