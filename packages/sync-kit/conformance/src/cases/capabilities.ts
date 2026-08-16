import type { Capabilities, ProviderId } from "@keeper.sh/sync-protocol";
import type { ConformanceCase } from "../registry/case";

const capabilityCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): readonly ConformanceCase<Provider>[] => {
  throw new Error(`unimplemented: capabilityCases(${supports.provider})`);
};

export { capabilityCases };
