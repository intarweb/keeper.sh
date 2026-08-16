import { describe, expect, test } from "vitest";
import { buildVtimezone, zoneCacheStatistics } from "../../src/index";
import { testOptions } from "../support/options";

const casablanca = { kind: "zoneId", value: "Africa/Casablanca" } as const;

describe("synthesising a VTIMEZONE for a zone whose rule never stabilises", () => {
  test("ICAL-L8: Morocco's moving transitions yield explicit observances rather than an invented rule", () => {
    expect(buildVtimezone(casablanca, 2026, testOptions()).kind).toBe("explicitObservances");
  });

  test("ICAL-L8: exactly zoneProjectionYears are projected, not more and not adaptively widened", () => {
    const options = testOptions({ limits: { zoneProjectionYears: 12 } });
    buildVtimezone(casablanca, 2026, options);

    expect(zoneCacheStatistics(options.zones).projectedYears).toBe(12);
  });

  test("ICAL-L8: a narrower ceiling projects fewer years, so the bound is the named limit", () => {
    const narrow = testOptions({ limits: { zoneProjectionYears: 3 } });
    buildVtimezone(casablanca, 2026, narrow);

    expect(zoneCacheStatistics(narrow.zones).projectedYears).toBe(3);
  });

  test("ICAL-L8: the validate-then-emit loop terminates inside a scheduler tick", () => {
    const startedAt = performance.now();
    buildVtimezone(casablanca, 2026, testOptions({ limits: { zoneProjectionYears: 400 } }));

    expect(performance.now() - startedAt).toBeLessThan(5000);
  });

  test("ICAL-L8: a zone whose rule does stabilise still emits an annual rule under the same ceiling", () => {
    const options = testOptions({ limits: { zoneProjectionYears: 12 } });

    expect(buildVtimezone({ kind: "zoneId", value: "Europe/Berlin" }, 2026, options).kind).toBe(
      "annualRule",
    );
    expect(zoneCacheStatistics(options.zones).projectedYears).toBe(12);
  });
});
