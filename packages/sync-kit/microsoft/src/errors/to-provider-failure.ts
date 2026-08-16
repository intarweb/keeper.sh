import type { AccountId, ListingScope, ProviderFailure } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";
import type { MicrosoftFailure } from "./classify";

interface FailureSurroundings {
  readonly account: AccountId;
  readonly scope: ListingScope | null;
}

const toProviderFailure = (
  failure: MicrosoftFailure,
  surroundings: FailureSurroundings,
): ProviderFailure => unimplemented(failure, surroundings);

export { toProviderFailure };
export type { FailureSurroundings };
