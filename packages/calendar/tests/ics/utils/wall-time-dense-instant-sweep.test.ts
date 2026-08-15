import { describe, expect, it } from "vitest";
import {
  getTimeZoneOffsetMinutes,
  instantToWallTime,
  wallTimeToInstant,
} from "../../../src/ics/utils/timezone-instant";
import { MS_PER_HOUR, MS_PER_MINUTE, SWEEP_TIMEOUT_MS } from "./wall-time-sweep-support";

describe("a dense sweep of instants through the wall clock and back", () => {
  const ZONES = [
    "America/New_York",
    "America/Santiago",
    "Antarctica/Troll",
    "Asia/Beirut",
    "Australia/Lord_Howe",
    "Europe/Berlin",
    "Pacific/Chatham",
  ];

  it("returns the instant it was given outside a fold and never a later one", () => {
    const drifted: string[] = [];

    for (const timeZone of ZONES) {
      for (
        let instant = Date.UTC(2027, 0, 1);
        instant < Date.UTC(2028, 0, 1);
        instant += 17 * MS_PER_MINUTE
      ) {
        const wallTime = instantToWallTime(new Date(instant), timeZone);
        const resolved = wallTimeToInstant(wallTime, timeZone).getTime();
        if (resolved > instant) {
          drifted.push(`${timeZone} ${new Date(instant).toISOString()} moved forward`);
          continue;
        }
        if (instantToWallTime(new Date(resolved), timeZone).getTime() !== wallTime.getTime()) {
          drifted.push(`${timeZone} ${new Date(instant).toISOString()} lost its wall time`);
        }
      }
    }

    expect(drifted).toEqual([]);
  }, SWEEP_TIMEOUT_MS);

  it("reports an offset in whole minutes for every instant it resolves", () => {
    const offsets = new Set<number>();
    for (const timeZone of ZONES) {
      for (
        let instant = Date.UTC(2027, 0, 1);
        instant < Date.UTC(2027, 3, 1);
        instant += 6 * MS_PER_HOUR
      ) {
        offsets.add(getTimeZoneOffsetMinutes(new Date(instant), timeZone));
      }
    }

    expect([...offsets].every((offset) => Number.isInteger(offset))).toBe(true);
  });
});
