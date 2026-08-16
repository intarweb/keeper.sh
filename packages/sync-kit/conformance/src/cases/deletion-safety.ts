import type { Capabilities, ProviderId } from "@keeper.sh/sync-protocol";
import type { ConformanceCase } from "../registry/case";

const deletionSafetyCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): readonly ConformanceCase<Provider>[] => {
  throw new Error(`unimplemented: deletionSafetyCases(${supports.provider})`);
};

export { deletionSafetyCases };
