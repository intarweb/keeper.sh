import type {
  CalendarKey,
  ListingScope,
  OperationName,
  ProviderFailure,
} from "@keeper.sh/sync-protocol";
import type { GoogleFailure } from "./classify";
import { unimplemented } from "../unimplemented";

interface FailureSurroundings {
  readonly operation: OperationName;
  readonly calendar: CalendarKey;
  readonly scope: ListingScope | null;
}

const toProviderFailure = (
  failure: GoogleFailure,
  surroundings: FailureSurroundings,
): ProviderFailure => unimplemented(failure, surroundings);

export { toProviderFailure };
export type { FailureSurroundings };
