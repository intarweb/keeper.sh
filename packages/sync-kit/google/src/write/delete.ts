import type {
  OperationContext,
  Result,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import type { WriteSurroundings } from "./create";
import { unimplemented } from "../unimplemented";

const deleteEvent = (
  intent: Extract<WriteIntent<"google">, { kind: "delete" } | { kind: "retire" }>,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => unimplemented(intent, context, surroundings);

export { deleteEvent };
