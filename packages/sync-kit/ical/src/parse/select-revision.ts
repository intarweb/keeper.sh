import type { WithholdReason } from "@keeper.sh/sync-protocol";
import type { EventIdentity } from "./identity";
import type { ParsedVevent, VeventOutcome } from "./parse-vevent";

type RevisionSelection =
  | {
      readonly kind: "selected";
      readonly winner: ParsedVevent;
      readonly superseded: readonly EventIdentity[];
    }
  | {
      readonly kind: "withheld";
      readonly identity: EventIdentity;
      readonly reason: Extract<WithholdReason, "supersededRevisionUnbuildable">;
    };

const selectCanonicalRevision = (_candidates: readonly VeventOutcome[]): RevisionSelection => {
  throw new Error("unimplemented");
};

export { selectCanonicalRevision };
export type { RevisionSelection };
