import type { Capabilities, ProviderId } from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId } from "../case-id";
import { conformanceCaseIds } from "../case-id";
import type { CaseGate } from "./case";

const gatedCaseIds: readonly ConformanceCaseId[] = [
  "CONF-O3",
  "CONF-O11",
  "CONF-O13",
  "CONF-O14",
  "CONF-O16",
  "CONF-O18",
  "CONF-O28",
  "CONF-O35",
  "CONF-O38",
];

const ungated: CaseGate = { kind: "ungated" };

const branchOn = (capability: keyof Capabilities, branch: string): CaseGate => ({
  kind: "branch",
  capability,
  branch,
});

const deltaGate = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
  boundBranch: string,
  freeBranch: string,
): CaseGate => {
  if (supports.delta.kind === "none") {
    return {
      kind: "skip",
      capability: "delta",
      reason: "the adapter declares no delta support, so no cursor case applies",
    };
  }
  if (supports.delta.windowBoundToCursor) {
    return branchOn("delta", boundBranch);
  }
  return branchOn("delta", freeBranch);
};

const ambiguityGate = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): CaseGate => {
  if (supports.removalsAreAmbiguous) {
    return branchOn("removalsAreAmbiguous", "ambiguous");
  }
  return branchOn("removalsAreAmbiguous", "unambiguous");
};

const echoGate = <Provider extends ProviderId>(supports: Capabilities<Provider>): CaseGate => {
  if (supports.echoesWrites) {
    return branchOn("echoesWrites", "echoes");
  }
  return branchOn("echoesWrites", "blind");
};

const gateFor = <Provider extends ProviderId>(
  id: ConformanceCaseId,
  supports: Capabilities<Provider>,
): CaseGate => {
  switch (id) {
    case "CONF-O3": {
      return branchOn("deletionAuthority", supports.deletionAuthority);
    }
    case "CONF-O11": {
      return deltaGate(supports, "windowBoundToCursor", "windowFreeCursor");
    }
    case "CONF-O13": {
      return ambiguityGate(supports);
    }
    case "CONF-O14": {
      return branchOn("precondition", supports.precondition);
    }
    case "CONF-O16": {
      return branchOn("provenanceChannel", supports.provenanceChannel);
    }
    case "CONF-O18": {
      return echoGate(supports);
    }
    case "CONF-O28": {
      return branchOn("representableRange", supports.representableRange.zeroDuration);
    }
    case "CONF-O35": {
      return branchOn("recurrenceWrite", supports.recurrenceWrite);
    }
    case "CONF-O38": {
      return deltaGate(supports, "tokenizedDelta", "tokenizedDelta");
    }
    default: {
      return ungated;
    }
  }
};

const branchNameOf = (gate: CaseGate): string | null => {
  switch (gate.kind) {
    case "branch": {
      return gate.branch;
    }
    case "ungated":
    case "skip": {
      return null;
    }
    default: {
      return null;
    }
  }
};

const ungatedCaseIdsOf = (): readonly ConformanceCaseId[] =>
  conformanceCaseIds.filter((id) => !gatedCaseIds.includes(id));

export { branchNameOf, gateFor, gatedCaseIds, ungatedCaseIdsOf };
