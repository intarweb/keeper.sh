import type { Instant, ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "./zone-cache";

const zoneOffsetMinutes = (_instant: Instant, _zone: ZoneId, _zones: ZoneCache): number => {
  throw new Error("unimplemented");
};

const formatUtcOffset = (_offsetMinutes: number): string => {
  throw new Error("unimplemented");
};

export { formatUtcOffset, zoneOffsetMinutes };
