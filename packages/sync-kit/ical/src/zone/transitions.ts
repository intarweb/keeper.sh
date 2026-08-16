import type { Instant, TimeWindow, ZoneId } from "@keeper.sh/sync-protocol";
import type { IcsLimits } from "../options";
import { millisecondsInMinute, offsetMinutesAt } from "./offset";
import { instantOf } from "./wall-time";
import type { ZoneCache } from "./zone-cache";

const scanStepMs = 16 * 24 * 60 * millisecondsInMinute;

const transitionBetween = (zones: ZoneCache, zone: ZoneId, beforeMs: number, afterMs: number): number => {
  let low = beforeMs;
  let high = afterMs;
  const target = offsetMinutesAt(zones, zone.value, high);
  while (high - low > millisecondsInMinute) {
    const middle = low + Math.floor((high - low) / (2 * millisecondsInMinute)) * millisecondsInMinute;
    if (middle === low) {
      return high;
    }
    if (offsetMinutesAt(zones, zone.value, middle) === target) {
      high = middle;
      continue;
    }
    low = middle;
  }
  return high;
};

const clampedEndMs = (startMs: number, endMs: number, limits: IcsLimits): number => {
  const at = new Date(startMs);
  at.setUTCFullYear(at.getUTCFullYear() + limits.zoneProjectionYears);
  return Math.min(endMs, at.getTime());
};

const findZoneTransitions = (
  zone: ZoneId,
  window: TimeWindow,
  zones: ZoneCache,
  limits: IcsLimits,
): readonly Instant[] => {
  const startMs = Date.parse(window.start.value);
  const endMs = clampedEndMs(startMs, Date.parse(window.end.value), limits);
  const found: Instant[] = [];
  let cursor = startMs;
  let carriedOffset = offsetMinutesAt(zones, zone.value, startMs);
  while (cursor < endMs) {
    const next = Math.min(cursor + scanStepMs, endMs);
    const nextOffset = offsetMinutesAt(zones, zone.value, next);
    if (nextOffset !== carriedOffset) {
      found.push(instantOf(transitionBetween(zones, zone, cursor, next)));
    }
    carriedOffset = nextOffset;
    cursor = next;
  }
  return found;
};

export { findZoneTransitions };
