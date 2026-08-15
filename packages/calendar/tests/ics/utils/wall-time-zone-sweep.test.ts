import { describe, expect, it } from "vitest";
import { SWEEP_TIMEOUT_MS, sweep } from "./wall-time-sweep-support";

const ALL_TIME_ZONES = Intl.supportedValuesOf("timeZone");

describe("resolving a wall time near every transition IANA declares", () => {
  it("names the same instant a two-offset derivation does, in every zone", () => {
    const outcome = sweep(
      ALL_TIME_ZONES,
      Date.UTC(2024, 0, 1),
      Date.UTC(2032, 0, 1),
    );

    expect(outcome.mismatches).toEqual([]);
    expect(outcome.zonesWithTransitions).toBeGreaterThan(100);
    expect(outcome.checked).toBeGreaterThan(10_000);
  }, SWEEP_TIMEOUT_MS);

  it("holds for the historical offsets carrying whole minutes and seconds", () => {
    const outcome = sweep(
      [
        "Africa/Monrovia",
        "America/St_Johns",
        "Asia/Kolkata",
        "Asia/Kathmandu",
        "Australia/Lord_Howe",
        "Europe/Amsterdam",
        "Europe/Dublin",
        "Europe/Lisbon",
        "Europe/Moscow",
        "Pacific/Apia",
        "Pacific/Chatham",
      ],
      Date.UTC(1901, 0, 1),
      Date.UTC(1980, 0, 1),
    );

    expect(outcome.mismatches).toEqual([]);
    expect(outcome.checked).toBeGreaterThan(1000);
  }, SWEEP_TIMEOUT_MS);
});
