import type { IcsLimits } from "../options";
import type { UnreadableReason } from "./patch";
import type { PropertyLine } from "./property-line";

interface WalkedProperty {
  readonly property: PropertyLine;
  readonly componentPath: readonly string[];
  readonly componentInstancePath: readonly number[];
}

type ComponentWalk =
  | { readonly kind: "walked"; readonly properties: readonly WalkedProperty[] }
  | { readonly kind: "refused"; readonly reason: UnreadableReason };

const walkComponents = (_body: string, _limits: IcsLimits): ComponentWalk => {
  throw new Error("unimplemented");
};

export { walkComponents };
export type { ComponentWalk, WalkedProperty };
