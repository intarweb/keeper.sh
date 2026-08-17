import { describe, expect, it } from "vitest";

import type { CalendarSummary } from "../src/api/domain";
import {
  buildSetupWorkflow,
  effectiveMappingCount,
  nextCalendarIndex,
  nextSetupStep,
  toggleMappingSelection,
} from "../src/features/accounts/setup-logic";

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

describe("account setup workflow", () => {
  it("includes only capability-relevant stages in web order", () => {
    const workflow = buildSetupWorkflow([
      calendar("pull", ["pull"]),
      calendar("push", ["push"]),
      calendar("both", ["pull", "push"]),
    ]);
    expect(workflow.steps).toEqual([
      "select",
      "rename",
      "destinations",
      "sources",
    ]);
    expect(workflow.destinationCalendars.map(({ id }) => id)).toEqual([
      "pull",
      "both",
    ]);
    expect(workflow.sourceCalendars.map(({ id }) => id)).toEqual([
      "push",
      "both",
    ]);
    expect(nextSetupStep(workflow, "destinations")).toBe("sources");
    expect(nextCalendarIndex(1, workflow.destinationCalendars)).toBe(
      "next-step",
    );
  });

  it("skips mapping stages when no selected calendar supports them", () => {
    const workflow = buildSetupWorkflow([calendar("read-only", [])]);
    expect(workflow.steps).toEqual(["select", "rename"]);
    expect(nextSetupStep(workflow, "rename")).toBe("finish");
  });
});

describe("mapping entitlement limits", () => {
  it("blocks additions at the limit but always permits removals", () => {
    const atLimit = { current: 2, limit: 2 };
    expect(
      toggleMappingSelection({
        candidateId: "new",
        initialIds: ["existing"],
        selectedIds: ["existing"],
        limit: atLimit,
      }),
    ).toEqual({ blocked: true, selectedIds: ["existing"] });
    expect(
      toggleMappingSelection({
        candidateId: "existing",
        initialIds: ["existing"],
        selectedIds: ["existing"],
        limit: atLimit,
      }),
    ).toEqual({ blocked: false, selectedIds: [] });
  });

  it("allows replacing a removed mapping without increasing global use", () => {
    const limit = { current: 2, limit: 2 };
    const result = toggleMappingSelection({
      candidateId: "replacement",
      initialIds: ["existing"],
      selectedIds: [],
      limit,
    });
    expect(result).toEqual({ blocked: false, selectedIds: ["replacement"] });
    expect(effectiveMappingCount(limit, ["existing"], result.selectedIds)).toBe(
      2,
    );
  });
});
