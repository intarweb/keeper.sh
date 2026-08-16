import type {
  AccountId,
  CalendarEnumeration,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import type { RequestSeam } from "../client/request";
import type { MicrosoftDependencies } from "../dependencies";
import { unimplemented } from "../unimplemented";

interface CalendarSurroundings {
  readonly dependencies: MicrosoftDependencies;
  readonly requests: RequestSeam;
}

const listMicrosoftCalendars = (
  account: AccountId,
  context: OperationContext,
  surroundings: CalendarSurroundings,
): Promise<Result<CalendarEnumeration>> => unimplemented(account, context, surroundings);

export { listMicrosoftCalendars };
export type { CalendarSurroundings };
