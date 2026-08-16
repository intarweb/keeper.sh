import type { Instant, OperationName, RemoteVersion } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const googleErrorReasons = [
  "fullSyncRequired",
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "accessTokenScopeInsufficient",
  "authError",
  "loginRequired",
  "duplicate",
  "conditionNotMet",
  "notFound",
  "deleted",
  "forbiddenForNonOrganizer",
] as const;

type GoogleErrorReason = (typeof googleErrorReasons)[number];

type GoogleFailure =
  | { readonly kind: "cursorLost" }
  | { readonly kind: "resourceGone" }
  | { readonly kind: "rateLimited"; readonly retryAfter: Instant | null }
  | { readonly kind: "conflict" }
  | { readonly kind: "preconditionFailed"; readonly version: RemoteVersion | null }
  | { readonly kind: "authExpired" }
  | { readonly kind: "notFound" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "transient"; readonly status: number | null }
  | { readonly kind: "permanent"; readonly status: number | null };

interface DecodedGoogleError {
  readonly status: number | null;
  readonly reasons: readonly string[];
  readonly retryAfter: Instant | null;
}

const classifyGoogleError = (
  decoded: DecodedGoogleError,
  operation: OperationName,
): GoogleFailure => unimplemented(decoded, operation);

const isRetryable = (failure: GoogleFailure): boolean => unimplemented(failure);

export { classifyGoogleError, googleErrorReasons, isRetryable };
export type { DecodedGoogleError, GoogleErrorReason, GoogleFailure };
