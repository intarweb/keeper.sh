import type { Fingerprint, RemoteVersion } from "./handles";

const preconditionKinds = ["version", "fingerprint", "none"] as const;
type PreconditionKind = (typeof preconditionKinds)[number];

type Precondition =
  | { readonly kind: "matchesVersion"; readonly version: RemoteVersion }
  | { readonly kind: "matchesFingerprint"; readonly fingerprint: Fingerprint }
  | { readonly kind: "absent" };

export { preconditionKinds };
export type { Precondition, PreconditionKind };
