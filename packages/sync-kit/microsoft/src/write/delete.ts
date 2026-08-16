import type { OperationContext, Result, WriteIntent, WriteOutcome } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";
import type { WriteSurroundings } from "./surroundings";

type Removing = Extract<WriteIntent<"microsoft">, { kind: "delete" } | { kind: "retire" }>;

const deleteInGraph = (
  intent: Removing,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => unimplemented(intent, context, surroundings);

export { deleteInGraph };
export type { Removing };
