import type { WithholdReason } from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";
import type { EventIdentity } from "../parse/identity";
import type { ParsedVevent } from "../parse/parse-vevent";
import type { CanonicalEvent } from "./canonical-event";

type CanonicalProjection =
  | { readonly kind: "projected"; readonly event: CanonicalEvent }
  | { readonly kind: "withheld"; readonly identity: EventIdentity; readonly reason: WithholdReason };

const projectCanonicalEvent = (_event: ParsedVevent, _options: IcsOptions): CanonicalProjection => {
  throw new Error("unimplemented");
};

export { projectCanonicalEvent };
export type { CanonicalProjection };
