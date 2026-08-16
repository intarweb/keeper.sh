import type {
  OperationContext,
  Result,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import type { WriteSurroundings } from "./create";
import { unimplemented } from "../unimplemented";

const updateEvent = (
  intent: Extract<WriteIntent<"google">, { kind: "update" }>,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => unimplemented(intent, context, surroundings);

export { updateEvent };
