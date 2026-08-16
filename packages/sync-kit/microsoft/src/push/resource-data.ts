import { unimplemented } from "../unimplemented";

interface RichHint {
  readonly kind: "richHint";
  readonly changeType: string;
  readonly hasResourceData: boolean;
}

const readRichHint = (entry: unknown): RichHint | null => unimplemented(entry);

export { readRichHint };
export type { RichHint };
