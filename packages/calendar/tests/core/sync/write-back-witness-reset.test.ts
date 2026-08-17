import { describe, expect, it } from "vitest";
import { eventMappingsTable } from "@keeper.sh/database/schema";
import { WRITE_BACK_WITNESS_RESET } from "../../../src/core/sync/write-back-policy";

const WRITE_BACK_BUDGET_PREFIX = "writeBack";

describe("clearing a recorded observation re-arms the mapping", () => {
  it("drops every component of the observation as one unit", () => {
    expect(WRITE_BACK_WITNESS_RESET).toMatchObject({
      destinationAvailability: null,
      destinationContentHash: null,
      destinationDescription: null,
      destinationEndTime: null,
      destinationIsAllDay: null,
      destinationLocation: null,
      destinationStartTime: null,
      destinationSummary: null,
    });
  });

  it("returns the spent budgets so a cleared quarantine can write again", () => {
    expect(WRITE_BACK_WITNESS_RESET).toMatchObject({
      writeBackDailyCount: 0,
      writeBackDailyWindowStart: null,
      writeBackEpoch: 0,
      writeBackEpochWindowStart: null,
    });
  });

  /*
   * Enumerated from the table rather than listed by hand: a budget column added later and
   * forgotten here leaves a mapping refused for good after a human has cleared the pause
   * that spent it, which is exactly the failure this reset exists to prevent.
   */
  it("leaves no write-back budget column behind on the mapping", () => {
    const budgetColumns = Object.keys(eventMappingsTable)
      .filter((name) => name.startsWith(WRITE_BACK_BUDGET_PREFIX));

    expect(Object.keys(WRITE_BACK_WITNESS_RESET).toSorted())
      .toEqual(expect.arrayContaining(budgetColumns.toSorted()));
  });
});
