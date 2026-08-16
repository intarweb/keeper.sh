import type { Instant, OperationName, RemoteVersion, TransportDisposition } from "@keeper.sh/sync-protocol";
import type { MicrosoftClock } from "../dependencies";
import { unimplemented } from "../unimplemented";
import type { DecodedGraphError } from "./graph-error";

const microsoftFailureKinds = [
  "gone",
  "duplicate",
  "throttled",
  "authRequired",
  "notFound",
  "conflict",
  "unsupported",
  "transport",
] as const;

type MicrosoftFailureKind = (typeof microsoftFailureKinds)[number];

type MicrosoftFailure =
  | { readonly kind: "gone" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "throttled"; readonly retryAfter: Instant | null }
  | { readonly kind: "authRequired" }
  | { readonly kind: "notFound" }
  | { readonly kind: "conflict"; readonly version: RemoteVersion | null }
  | { readonly kind: "unsupported"; readonly operation: OperationName }
  | {
      readonly kind: "transport";
      readonly status: number | null;
      readonly disposition: TransportDisposition;
    };

interface ClassifyOptions {
  readonly clock: MicrosoftClock;
  readonly retryAfterCeilingMs: number;
}

const classifyGraphError = (
  decoded: DecodedGraphError,
  operation: OperationName,
  options: ClassifyOptions,
): MicrosoftFailure => unimplemented(decoded, operation, options);

const isRetryable = (failure: MicrosoftFailure): boolean => unimplemented(failure);

export { classifyGraphError, isRetryable, microsoftFailureKinds };
export type { ClassifyOptions, MicrosoftFailure, MicrosoftFailureKind };
