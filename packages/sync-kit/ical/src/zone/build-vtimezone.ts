import type { ZoneId } from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";

type VtimezoneBlock =
  | { readonly kind: "annualRule"; readonly text: string }
  | { readonly kind: "explicitObservances"; readonly text: string };

const buildVtimezone = (
  _zone: ZoneId,
  _referenceYear: number,
  _options: IcsOptions): VtimezoneBlock => {
  throw new Error("unimplemented");
};

export { buildVtimezone };
export type { VtimezoneBlock };
