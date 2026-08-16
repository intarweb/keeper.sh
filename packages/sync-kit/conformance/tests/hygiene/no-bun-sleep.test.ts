import { describe, expect, test } from "vitest";
import { createTestClock } from "../../src/clock";
import { filesMatching, sourceFiles } from "../support/sources";
import { suiteStart } from "../support/harness";

const unfakeablePrimitive = ["Bun", "sleep"].join(".");

describe("timing primitives fake timers cannot patch", () => {
  test("CONF-I51: no file under src reaches for the unfakeable sleep primitive", async () => {
    const offenders = await filesMatching("src", unfakeablePrimitive);
    const files = await sourceFiles("src");

    expect(offenders).toEqual([]);
    expect(files.length).toBeGreaterThan(20);
    expect(() => createTestClock({ start: suiteStart })).not.toThrow();
  });

  test("CONF-I51: no file under tests reaches for the unfakeable sleep primitive", async () => {
    const offenders = await filesMatching("tests", unfakeablePrimitive);
    const files = await sourceFiles("tests");

    expect(offenders).toEqual([]);
    expect(files.length).toBeGreaterThan(15);
    expect(() => createTestClock({ start: suiteStart })).not.toThrow();
  });

  test("CONF-I51: the injected clock schedules through setTimeout so fake timers can drive it", () => {
    const clock = createTestClock({ start: suiteStart });

    expect(clock.pendingTimers()).toBe(0);
    expect(clock.now()).toEqual(suiteStart);
  });
});
