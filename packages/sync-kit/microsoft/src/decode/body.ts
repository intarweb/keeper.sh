import type { ItemBody } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

type BodyReading =
  | { readonly kind: "comparable"; readonly text: string }
  | { readonly kind: "uncomparable"; readonly reason: "bodyFormat" | "absent" };

const readBody = (body: ItemBody | null): BodyReading => unimplemented(body);

export { readBody };
export type { BodyReading };
