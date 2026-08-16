import type { EditableContent, NormalizedContent, Result } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const normalizeForMicrosoft = (
  content: EditableContent,
  hash: (input: string) => string,
): Result<NormalizedContent<"microsoft">> => unimplemented(content, hash);

export { normalizeForMicrosoft };
