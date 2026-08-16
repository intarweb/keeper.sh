import type { InstallationId, Instant } from "@keeper.sh/sync-protocol";
import type { ConformanceEnvironment } from "./options";

interface EnvironmentOptions {
  readonly start: Instant;
  readonly installation: InstallationId;
  readonly hash: (input: string) => string;
}

const createConformanceEnvironment = (options: EnvironmentOptions): ConformanceEnvironment => {
  throw new Error(`unimplemented: createConformanceEnvironment(${options.installation.value})`);
};

export { createConformanceEnvironment };
export type { EnvironmentOptions };
