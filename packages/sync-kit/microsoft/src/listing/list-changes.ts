import type {
  ChangeListing,
  ListChangesRequest,
  ListingScope,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "@keeper.sh/sync-ical";
import type { RequestSeam } from "../client/request";
import type { SingleFlight } from "../client/single-flight";
import type { CursorFrontier } from "../cursor/frontier";
import type { MicrosoftDependencies } from "../dependencies";
import { unimplemented } from "../unimplemented";
import type { ResyncTrigger } from "./resync-triggers";

interface ListingSurroundings {
  readonly dependencies: MicrosoftDependencies;
  readonly requests: RequestSeam;
  readonly flights: SingleFlight<Result<ChangeListing>>;
  readonly frontier: CursorFrontier;
  readonly zones: ZoneCache;
}

const cursorLostListing = (scope: ListingScope, trigger: ResyncTrigger): ChangeListing =>
  unimplemented(scope, trigger);

const listMicrosoftChanges = (
  request: ListChangesRequest,
  context: OperationContext,
  surroundings: ListingSurroundings,
): Promise<Result<ChangeListing>> => unimplemented(request, context, surroundings);

export { cursorLostListing, listMicrosoftChanges };
export type { ListingSurroundings };
