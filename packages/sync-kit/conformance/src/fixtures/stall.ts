import type { OperationName } from "@keeper.sh/sync-protocol";
import type { ProviderDecorator } from "./decorate";

const stallingOn = (matches: (operation: OperationName) => boolean): ProviderDecorator => {
  throw new Error(`unimplemented: stallingOn(${typeof matches})`);
};

export { stallingOn };
