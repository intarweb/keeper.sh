import type { Instant, TimeWindow, ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "./zone-cache";

const findZoneTransitions = (
  _zone: ZoneId,
  _window: TimeWindow,
  _zones: ZoneCache): readonly Instant[] => {
  throw new Error("unimplemented");
};

export { findZoneTransitions };
