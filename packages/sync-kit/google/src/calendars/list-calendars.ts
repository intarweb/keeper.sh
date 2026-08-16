import type {
  AccountId,
  CalendarEnumeration,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "../dependencies";
import type { RequestSeam } from "../client/request";
import { unimplemented } from "../unimplemented";

interface EnumerationSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
}

const listGoogleCalendars = (
  account: AccountId,
  context: OperationContext,
  surroundings: EnumerationSurroundings,
): Promise<Result<CalendarEnumeration>> => unimplemented(account, context, surroundings);

export { listGoogleCalendars };
export type { EnumerationSurroundings };
