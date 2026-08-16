import type { Instant, ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "../zone/zone-cache";

type ZonedDateRendering =
  | { readonly kind: "localWithTzid"; readonly text: string }
  | { readonly kind: "utc"; readonly text: string };

const serialiseZonedDate = (
  _instant: Instant,
  _zone: ZoneId,
  _zones: ZoneCache): ZonedDateRendering => {
  throw new Error("unimplemented");
};

export { serialiseZonedDate };
export type { ZonedDateRendering };
