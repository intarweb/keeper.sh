import { describe, expect, test } from "vitest";
import { buildVtimezone } from "../../src/index";
import { testOptions } from "../support/options";

const build = (zone: string, year = 2026) =>
  buildVtimezone({ kind: "zoneId", value: zone }, year, testOptions());

describe("synthesising a VTIMEZONE for a zone we are about to write", () => {
  test("ICAL-I31: a stable annual rule is emitted only after the full projection round-trips", () => {
    const block = build("Europe/Berlin");

    expect(block.kind).toBe("annualRule");
    expect(block.text).toContain("RRULE:FREQ=YEARLY");
    expect(block.text).toContain("TZID:Europe/Berlin");
  });

  test("ICAL-I31: a southern-hemisphere zone keeps its transition direction", () => {
    const block = build("Australia/Sydney");

    expect(block.text).toContain("BEGIN:DAYLIGHT");
    expect(block.text).toContain("BEGIN:STANDARD");
    expect(block.text).toContain("TZOFFSETTO:+1100");
  });

  test("ICAL-I31: a non-hour transition size survives synthesis", () => {
    const block = build("Australia/Lord_Howe");

    expect(block.text).toContain("TZOFFSETFROM:+1030");
    expect(block.text).toContain("TZOFFSETTO:+1100");
  });

  test("ICAL-I31: a fixed-offset zone emits one baseline STANDARD observance and no rule", () => {
    const block = build("UTC");

    expect(block.kind).toBe("explicitObservances");
    expect(block.text).toContain("BEGIN:STANDARD");
    expect(block.text).not.toContain("RRULE");
    expect(block.text).not.toContain("BEGIN:DAYLIGHT");
  });

  test("ICAL-I31: a Windows identifier is normalised before the zone is projected", () => {
    const block = buildVtimezone(
      { kind: "zoneId", value: "Eastern Standard Time" },
      2026,
      testOptions(),
    );

    expect(block.text).toContain("TZID:America/New_York");
  });

  test("ICAL-I31: an old reference year does not truncate the rules current events need", () => {
    const historic = build("Europe/Berlin", 1996);
    const current = build("Europe/Berlin", 2026);

    expect(historic.text).not.toBe("");
    expect(current.kind).toBe("annualRule");
  });
});
