import type { ConformanceCaseId } from "../case-id";
import type { ConformanceEnvironment, ProviderUnderTest } from "../options";

const createMutantReferenceProvider = (
  environment: ConformanceEnvironment,
  defect: ConformanceCaseId,
): Promise<ProviderUnderTest<"reference">> => {
  throw new Error(
    `unimplemented: createMutantReferenceProvider(${environment.installation.value}, ${defect})`,
  );
};

export { createMutantReferenceProvider };
