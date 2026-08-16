import type {
  OperationContext,
  Result,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import type { GoogleDependencies } from "../dependencies";
import type { RequestSeam } from "../client/request";
import { unimplemented } from "../unimplemented";

interface WriteSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
}

const createEvent = (
  intent: Extract<WriteIntent<"google">, { kind: "create" }>,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => unimplemented(intent, context, surroundings);

export { createEvent };
export type { WriteSurroundings };
