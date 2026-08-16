import type { Instant, TimeWindow, ZoneId } from "@keeper.sh/sync-protocol";
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

const findZoneTransitions = (zone: ZoneId, window: TimeWindow, zones: ZoneCache): readonly Instant[] => {
  const startMs = Date.parse(window.start.value);
  const endMs = Date.parse(window.end.value);
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
