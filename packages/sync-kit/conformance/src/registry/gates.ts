import type { Capabilities, ProviderId } from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId } from "../case-id";
import type { CaseGate } from "./case";

const gateFor = <Provider extends ProviderId>(
  id: ConformanceCaseId,
  supports: Capabilities<Provider>,
): CaseGate => {
  throw new Error(`unimplemented: gateFor(${id}, ${supports.provider})`);
};

const branchNameOf = (gate: CaseGate): string | null => {
  throw new Error(`unimplemented: branchNameOf(${gate.kind})`);
};

export { branchNameOf, gateFor };
