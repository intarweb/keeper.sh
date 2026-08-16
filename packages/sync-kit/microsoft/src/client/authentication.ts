import type { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import { unimplemented } from "../unimplemented";

interface HeldTokenOptions {
  readonly getAccessToken: () => Promise<string>;
}

const createHeldTokenAuthenticationProvider = (
  options: HeldTokenOptions,
): AuthenticationProvider => unimplemented(options);

export { createHeldTokenAuthenticationProvider };
export type { HeldTokenOptions };
