import type { OperationContext, Result, WriteIntent, WriteOutcome } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";
import type { WriteSurroundings } from "./surroundings";

const createInGraph = (
  intent: Extract<WriteIntent<"microsoft">, { kind: "create" }>,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => unimplemented(intent, context, surroundings);

export { createInGraph };
