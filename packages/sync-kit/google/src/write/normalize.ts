import type { EditableContent, NormalizedContent, Result } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const normalizeForGoogle = (
  content: EditableContent,
  hash: (input: string) => string,
): Result<NormalizedContent<"google">> => unimplemented(content, hash);

const projectDescription = (description: string | null): string | null => unimplemented(description);

export { normalizeForGoogle, projectDescription };
