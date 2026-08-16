import type { EditableContent, NormalizedContent, Result } from "@keeper.sh/sync-protocol";

const normalizeForReference = (
  content: EditableContent,
  hash: (input: string) => string,
): Result<NormalizedContent<"reference">> => {
  throw new Error(`unimplemented: normalizeForReference(${content.title.length}, ${typeof hash})`);
};

const rewriteAsProviderWould = (content: EditableContent): EditableContent => {
  throw new Error(`unimplemented: rewriteAsProviderWould(${content.title.length})`);
};

export { normalizeForReference, rewriteAsProviderWould };
