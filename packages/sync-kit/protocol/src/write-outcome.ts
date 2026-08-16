import type { DeleteHandle, RemoteEventId, RemoteVersion } from "./handles";
import type { BoundedSample } from "./diagnostics";
import type { Precondition } from "./precondition";

interface RemoteRef {
  readonly id: RemoteEventId;
  readonly deleteHandle?: DeleteHandle;
}

type EchoVerdict =
  | { readonly kind: "matched" }
  | { readonly kind: "diverged"; readonly fields: BoundedSample };

const notAttemptedReasons = ["superseded", "aborted", "budgetExhausted"] as const;
type NotAttemptedReason = (typeof notAttemptedReasons)[number];

const representabilityConstraints = [
  "minimumSpan",
  "invertedRange",
  "allDayGrid",
  "recurrenceDialect",
  "zoneIdentifier",
] as const;
type RepresentabilityConstraint = (typeof representabilityConstraints)[number];

type WriteOutcome =
  | {
      readonly kind: "created";
      readonly remote: RemoteRef;
      readonly version: RemoteVersion;
      readonly echo?: EchoVerdict | boolean;
    }
  | {
      readonly kind: "updated";
      readonly remote: RemoteRef;
      readonly version: RemoteVersion;
      readonly echo?: EchoVerdict | boolean;
      readonly observed?: Precondition;
    }
  | { readonly kind: "alreadyExists"; readonly remote: RemoteRef; readonly version: RemoteVersion }
  | { readonly kind: "unchanged"; readonly remote: RemoteRef; readonly version: RemoteVersion }
  | { readonly kind: "deleted"; readonly remote: RemoteRef }
  | { readonly kind: "alreadyAbsent"; readonly remote: RemoteRef }
  | { readonly kind: "unrepresentable"; readonly constraint: RepresentabilityConstraint }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

export { notAttemptedReasons, representabilityConstraints };
export type {
  EchoVerdict,
  NotAttemptedReason,
  RemoteRef,
  RepresentabilityConstraint,
  WriteOutcome,
};
