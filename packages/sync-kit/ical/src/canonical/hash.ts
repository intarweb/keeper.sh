import type { Fingerprint } from "@keeper.sh/sync-protocol";
import type { CanonicalEvent } from "./canonical-event";

const canonicalEventFingerprint = (_event: CanonicalEvent): Fingerprint => {
  throw new Error("unimplemented");
};

export { canonicalEventFingerprint };
