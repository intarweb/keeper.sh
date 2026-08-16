import type {
  ChangeListing,
  ListChangesRequest,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "../dependencies";
import type { RequestSeam } from "../client/request";
import type { SingleFlight } from "../client/single-flight";
import { unimplemented } from "../unimplemented";

interface ListingSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
  readonly flights: SingleFlight<Result<ChangeListing>>;
}

const listGoogleChanges = (
  request: ListChangesRequest,
  context: OperationContext,
  surroundings: ListingSurroundings,
): Promise<Result<ChangeListing>> => unimplemented(request, context, surroundings);

export { listGoogleChanges };
export type { ListingSurroundings };
