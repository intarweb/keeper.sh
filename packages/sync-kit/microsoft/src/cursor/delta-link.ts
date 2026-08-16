import { unimplemented } from "../unimplemented";

type DeltaLink =
  | { readonly kind: "advance"; readonly deltaLink: string }
  | { readonly kind: "continue"; readonly nextLink: string }
  | { readonly kind: "lost" };

const readDeltaLink = (page: unknown): DeltaLink => unimplemented(page);

export { readDeltaLink };
export type { DeltaLink };
