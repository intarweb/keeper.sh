import type { ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "@keeper.sh/sync-ical";
import { unimplemented } from "../unimplemented";

type ZoneReading =
  | { readonly kind: "resolved"; readonly zone: ZoneId }
  | { readonly kind: "unresolvable"; readonly identifier: string };

const resolveGraphZone = (identifier: string | null, zones: ZoneCache): ZoneReading =>
  unimplemented(identifier, zones);

export { resolveGraphZone };
export type { ZoneReading };
