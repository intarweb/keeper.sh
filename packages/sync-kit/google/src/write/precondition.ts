import type { ObservedPrecondition, RemoteVersion } from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { versionOfEtag } from "../decode/identity";

type PreconditionHeader =
  | { readonly kind: "conditional"; readonly headers: Record<string, string> }
  | { readonly kind: "unsupported" };

const ifMatchHeader = (precondition: ObservedPrecondition): PreconditionHeader => {
  switch (precondition.kind) {
    case "matchesVersion": {
      return { kind: "conditional", headers: { "If-Match": `"${precondition.version.value}"` } };
    }
    case "matchesFingerprint": {
      return { kind: "unsupported" };
    }
    default: {
      return assertNever(precondition);
    }
  }
};

const versionOfEtagHeader = (etag: string | null): RemoteVersion | null => versionOfEtag(etag);

export { ifMatchHeader, versionOfEtagHeader };
export type { PreconditionHeader };
