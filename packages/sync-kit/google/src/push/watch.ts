import type {
  CalendarKey,
  Instant,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "../dependencies";
import type { RequestSeam } from "../client/request";
import { unimplemented } from "../unimplemented";

interface WatchRequest {
  readonly calendar: CalendarKey;
  readonly callbackUrl: string;
  readonly token: string;
}

interface WatchChannel {
  readonly channelId: string;
  readonly resourceId: string;
  readonly calendar: CalendarKey;
  readonly expiration: Instant;
}

interface WatchSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
}

type StopOutcome = { readonly kind: "stopped" } | { readonly kind: "alreadyGone" };

const registerWatchChannel = (
  request: WatchRequest,
  context: OperationContext,
  surroundings: WatchSurroundings,
): Promise<Result<WatchChannel>> => unimplemented(request, context, surroundings);

const renewWatchChannel = (
  channel: WatchChannel,
  request: WatchRequest,
  context: OperationContext,
  surroundings: WatchSurroundings,
): Promise<Result<WatchChannel>> => unimplemented(channel, request, context, surroundings);

const stopWatchChannel = (
  channel: WatchChannel,
  context: OperationContext,
  surroundings: WatchSurroundings,
): Promise<Result<StopOutcome>> => unimplemented(channel, context, surroundings);

export { registerWatchChannel, renewWatchChannel, stopWatchChannel };
export type { StopOutcome, WatchChannel, WatchRequest, WatchSurroundings };
