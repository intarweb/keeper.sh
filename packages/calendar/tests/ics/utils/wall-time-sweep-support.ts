import { instantToWallTime, wallTimeToInstant } from "../../../src/ics/utils/timezone-instant";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const SWEEP_TIMEOUT_MS = 300_000;

interface ZoneTransition {
  instant: number;
  offsetFromMs: number;
  offsetToMs: number;
}

const offsetMilliseconds = (instant: number, timeZone: string): number =>
  instantToWallTime(new Date(instant), timeZone).getTime() - instant;

const findTransitionInstant = (
  lowerBound: number,
  upperBound: number,
  timeZone: string,
  offsetFromMs: number,
): number => {
  let lower = lowerBound;
  let upper = upperBound;
  while (upper - lower > 1) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (offsetMilliseconds(midpoint, timeZone) === offsetFromMs) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }
  return upper;
};

const collectTransitions = (timeZone: string, from: number, to: number): ZoneTransition[] => {
  const transitions: ZoneTransition[] = [];
  let previousSample = from;
  let previousOffset = offsetMilliseconds(from, timeZone);

  for (let sample = from + MS_PER_DAY; sample <= to; sample += MS_PER_DAY) {
    const offset = offsetMilliseconds(sample, timeZone);
    if (offset !== previousOffset) {
      transitions.push({
        instant: findTransitionInstant(previousSample, sample, timeZone, previousOffset),
        offsetFromMs: previousOffset,
        offsetToMs: offset,
      });
      previousOffset = offset;
    }
    previousSample = sample;
  }

  return transitions;
};

const wallTimeIsRepresentable = (
  wallTime: number,
  expected: number,
  transition: ZoneTransition,
): boolean => {
  if (expected < transition.instant) {
    return expected === wallTime - transition.offsetFromMs;
  }
  return expected === wallTime - transition.offsetToMs;
};

const resolveExpectedInstant = (wallTime: number, transition: ZoneTransition): number => {
  const beforeCandidate = wallTime - transition.offsetFromMs;
  const afterCandidate = wallTime - transition.offsetToMs;
  const beforeIsValid = beforeCandidate < transition.instant;
  const afterIsValid = afterCandidate >= transition.instant;

  if (beforeIsValid && afterIsValid) {
    return Math.min(beforeCandidate, afterCandidate);
  }
  if (beforeIsValid) {
    return beforeCandidate;
  }
  if (afterIsValid) {
    return afterCandidate;
  }
  return beforeCandidate;
};

const WALL_TIME_OFFSETS_MINUTES = [-180, -90, -60, -30, -1, 0, 1, 30, 60, 90, 180];

const collectWallTimes = (transition: ZoneTransition): number[] => {
  const wallTimes = new Set<number>();
  for (const minutes of WALL_TIME_OFFSETS_MINUTES) {
    wallTimes.add(transition.instant + transition.offsetFromMs + minutes * MS_PER_MINUTE);
    wallTimes.add(transition.instant + transition.offsetToMs + minutes * MS_PER_MINUTE);
  }
  return [...wallTimes];
};

interface SweepOutcome {
  checked: number;
  mismatches: string[];
  zonesWithTransitions: number;
}

const sweep = (timeZones: string[], from: number, to: number): SweepOutcome => {
  const mismatches: string[] = [];
  let checked = 0;
  let zonesWithTransitions = 0;

  for (const timeZone of timeZones) {
    const transitions = collectTransitions(timeZone, from, to);
    if (transitions.length > 0) {
      zonesWithTransitions += 1;
    }

    for (const transition of transitions) {
      for (const wallTime of collectWallTimes(transition)) {
        checked += 1;
        const expected = resolveExpectedInstant(wallTime, transition);
        const actual = wallTimeToInstant(new Date(wallTime), timeZone).getTime();
        if (actual !== expected) {
          mismatches.push(
            `${timeZone} wall=${new Date(wallTime).toISOString()} `
            + `transition=${new Date(transition.instant).toISOString()} `
            + `expected=${new Date(expected).toISOString()} actual=${new Date(actual).toISOString()}`,
          );
          continue;
        }
        const readBack = instantToWallTime(new Date(actual), timeZone).getTime();
        const wallTimeExists = wallTimeIsRepresentable(wallTime, expected, transition);
        if (wallTimeExists && readBack !== wallTime) {
          mismatches.push(
            `${timeZone} round trip wall=${new Date(wallTime).toISOString()} `
            + `read back as ${new Date(readBack).toISOString()}`,
          );
        }
      }
    }
  }

  return { checked, mismatches, zonesWithTransitions };
};

export {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  SWEEP_TIMEOUT_MS,
  collectTransitions,
  sweep,
};

export type { SweepOutcome, ZoneTransition };
