import type { WriteIntent } from "@keeper.sh/sync-protocol";
import type { ProviderDecorator } from "./decorate";

const conflictingOn = (matches: (intent: WriteIntent) => boolean): ProviderDecorator => {
  throw new Error(`unimplemented: conflictingOn(${typeof matches})`);
};

export { conflictingOn };
