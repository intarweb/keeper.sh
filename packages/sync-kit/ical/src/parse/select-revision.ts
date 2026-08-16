import type { WithholdReason } from "@keeper.sh/sync-protocol";
import type { EventIdentity } from "./identity";
import type { ParsedVevent, VeventOutcome } from "./parse-vevent";
import { compareEventRevisions } from "./revision-order";

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

const parsedEvents = (candidates: readonly VeventOutcome[]): readonly ParsedVevent[] =>
  candidates.flatMap((candidate) => {
    if (candidate.kind !== "parsed") {
      return [];
    }
    return [candidate.event];
  });

const withheldIdentityOf = (candidates: readonly VeventOutcome[]): EventIdentity | null => {
  for (const candidate of candidates) {
    if (candidate.kind === "parsed") {
      return { kind: "master", uid: candidate.event.identity.uid };
    }
    if (candidate.kind === "withheld" && candidate.identity.uid) {
      return { kind: "master", uid: candidate.identity.uid };
    }
  }
  return null;
};

const bestOf = (events: readonly ParsedVevent[]): ParsedVevent | null => {
  const ordered = [...events].toSorted((left, right) => compareEventRevisions(left, right));
  return ordered.at(-1) ?? null;
};

const selectCanonicalRevision = (candidates: readonly VeventOutcome[]): RevisionSelection => {
  const events = parsedEvents(candidates);
  const unbuildable = candidates.some((candidate) => candidate.kind === "withheld");
  const identity = withheldIdentityOf(candidates);
  const winner = bestOf(events);
  if (unbuildable || !winner || !identity) {
    return {
      kind: "withheld",
      identity: identity ?? { kind: "master", uid: { kind: "eventUid", value: "" } },
      reason: "supersededRevisionUnbuildable",
    };
  }
  return {
    kind: "selected",
    winner,
    superseded: events.filter((event) => event !== winner).map((event) => event.identity),
  };
};

export { selectCanonicalRevision };
export type { RevisionSelection };
