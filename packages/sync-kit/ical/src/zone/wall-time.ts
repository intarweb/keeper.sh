import type { Instant, ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "./zone-cache";

interface WallTime {
  readonly kind: "wallTime";
  readonly value: string;
}

type WallTimeResolution =
  | { readonly kind: "unique"; readonly instant: Instant }
  | { readonly kind: "fold"; readonly instant: Instant; readonly discarded: Instant }
  | { readonly kind: "gap"; readonly instant: Instant; readonly shiftMinutes: number };

const resolveWallTime = (_wall: WallTime, _zone: ZoneId, _zones: ZoneCache): WallTimeResolution => {
  throw new Error("unimplemented");
};

const instantToWallTime = (_instant: Instant, _zone: ZoneId, _zones: ZoneCache): WallTime => {
  throw new Error("unimplemented");
};

export { instantToWallTime, resolveWallTime };
export type { WallTime, WallTimeResolution };
