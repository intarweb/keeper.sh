import type {
  OperationContext,
  Result,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import type { WriteSurroundings } from "./create";
import { unimplemented } from "../unimplemented";

const writeToGoogle = (
  intent: WriteIntent<"google">,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => unimplemented(intent, context, surroundings);

export { writeToGoogle };
