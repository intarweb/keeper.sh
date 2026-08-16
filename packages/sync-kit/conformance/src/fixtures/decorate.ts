import type { ProviderId } from "@keeper.sh/sync-protocol";
import type { ProviderUnderTest } from "../options";

type ProviderDecorator = <Provider extends ProviderId>(
  provider: ProviderUnderTest<Provider>,
) => ProviderUnderTest<Provider>;

const composeDecorators = (
  decorators: readonly ProviderDecorator[],
): ProviderDecorator => {
  throw new Error(`unimplemented: composeDecorators(${decorators.length})`);
};

const undecorated: ProviderDecorator = <Provider extends ProviderId>(
  provider: ProviderUnderTest<Provider>,
): ProviderUnderTest<Provider> => provider;

export { composeDecorators, undecorated };
export type { ProviderDecorator };
