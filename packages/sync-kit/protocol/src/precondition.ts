import type { Fingerprint, RemoteVersion } from "./handles";

const preconditionKinds = ["version", "fingerprint", "none"] as const;
type PreconditionKind = (typeof preconditionKinds)[number];

interface Precondition {
  readonly kind: "matchesVersion" | "matchesFingerprint" | "absent";
  readonly version?: RemoteVersion;
  readonly fingerprint?: Fingerprint;
}

export { preconditionKinds };
export type { Precondition, PreconditionKind };
