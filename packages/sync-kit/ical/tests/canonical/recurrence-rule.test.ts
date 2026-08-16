import { describe, expect, test } from "vitest";
import { canonicalizeRecurrenceRule } from "../../src/index";

describe("canonicalising an RRULE before it is hashed", () => {
  test("ICAL-I51: part names and values are uppercased so a provider's casing cannot move the hash", () => {
    expect(canonicalizeRecurrenceRule("freq=weekly;byday=mo,we")).toBe(
      canonicalizeRecurrenceRule("FREQ=WEEKLY;BYDAY=MO,WE"),
    );
  });

  test("ICAL-I51: part order is fixed, so a reordered rule hashes as the same rule", () => {
    expect(canonicalizeRecurrenceRule("BYDAY=MO,WE;FREQ=WEEKLY")).toBe(
      canonicalizeRecurrenceRule("FREQ=WEEKLY;BYDAY=MO,WE"),
    );
  });

  test("RFC 5545 §3.3.10: UNTIL is written in UTC with a Z suffix", () => {
    expect(canonicalizeRecurrenceRule("FREQ=WEEKLY;UNTIL=20260406T235959")).toContain(
      "UNTIL=20260406T235959Z",
    );
  });

  test("ICAL-I51: the rule is canonicalised, never expanded, so a tzdata release cannot move the hash", () => {
    const canonical = canonicalizeRecurrenceRule("FREQ=WEEKLY;COUNT=520;BYDAY=MO");

    expect(canonical).toContain("FREQ=WEEKLY");
    expect(canonical).toContain("COUNT=520");
    expect(canonical.split(";").length).toBeLessThan(10);
  });

  test("ICAL-I51: a rule that is already canonical is a fixed point", () => {
    const once = canonicalizeRecurrenceRule("FREQ=WEEKLY;BYDAY=MO,WE");

    expect(canonicalizeRecurrenceRule(once)).toBe(once);
  });
});
