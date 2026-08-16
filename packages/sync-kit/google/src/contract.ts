import type { ProviderContract } from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "./dependencies";
import { unimplemented } from "./unimplemented";

const createGoogleContract = (
  dependencies: GoogleDependencies,
): ProviderContract<"google"> => unimplemented(dependencies);

export { createGoogleContract };
