import type { ZoneId } from "@keeper.sh/sync-protocol";
import type { DeclaredZone } from "./vtimezone";
import type { ZoneCache } from "./zone-cache";

const zoneResolutionRungs = [
  "ianaDirect",
  "windowsCldr",
  "embeddedIanaSegment",
  "declaredFixedOffset",
] as const;
type ZoneResolutionRung = (typeof zoneResolutionRungs)[number];

const zoneRefusals = ["unknownIdentifier", "declaredZoneChangesOffset", "subMinuteOffset"] as const;
type ZoneRefusal = (typeof zoneRefusals)[number];

type ZoneResolution =
  | { readonly kind: "resolved"; readonly zone: ZoneId; readonly via: ZoneResolutionRung }
  | { readonly kind: "unsupported"; readonly identifier: string; readonly reason: ZoneRefusal };

const resolveZoneIdentifier = (
  _identifier: string,
  _declared: readonly DeclaredZone[],
  _zones: ZoneCache): ZoneResolution => {
  throw new Error("unimplemented");
};

export { resolveZoneIdentifier, zoneRefusals, zoneResolutionRungs };
export type { ZoneRefusal, ZoneResolution, ZoneResolutionRung };
