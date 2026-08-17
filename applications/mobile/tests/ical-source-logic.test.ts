import { describe, expect, it } from "vitest";

import type { CalendarSummary } from "../src/api/domain";
import { includedIcalSourceCandidates } from "../src/features/settings/ical-source-logic";

function calendar(id: string, capabilities: string[]): CalendarSummary {
  return {
    id,
    capabilities,
    name: id,
    calendarType: "google",
    accountId: "account",
    provider: "google",
    providerName: "Google",
    providerIcon: null,
    displayName: null,
    email: null,
    accountLabel: "Work",
    accountIdentifier: "work@example.com",
    needsReauthentication: false,
    includeInIcalFeed: false,
    disabled: false,
  };
}

describe("iCal source inclusion", () => {
  it("shows pull-capable sources and excludes push-only destinations", () => {
    expect(
      includedIcalSourceCandidates([
        calendar("pull", ["pull"]),
        calendar("push", ["push"]),
        calendar("both", ["pull", "push"]),
      ]).map(({ id }) => id),
    ).toEqual(["pull", "both"]);
  });
});
