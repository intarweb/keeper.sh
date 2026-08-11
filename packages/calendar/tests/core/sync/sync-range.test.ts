import { describe, expect, it } from "vitest";
import {
  createSyncWindow,
  getEffectiveSyncRanges,
  getConfigurableSyncWindow,
  getWiderSyncRange,
  intersectSyncWindows,
  isSyncRangeWider,
} from "../../../src/core/sync/sync-range";

describe("configurable sync ranges", () => {
  it("builds independent historic and future windows from the start of today", () => {
    const window = getConfigurableSyncWindow(
      "3_months",
      "2_years",
      new Date(2026, 6, 20, 15, 42, 10),
    );

    expect(window).toEqual({
      timeMin: new Date(2026, 3, 20),
      timeMax: new Date(2028, 6, 20),
    });
  });

  it("clamps month ranges at the end of shorter months", () => {
    const window = getConfigurableSyncWindow(
      "1_month",
      "1_month",
      new Date(2026, 2, 31, 12),
    );

    expect(window).toEqual({
      timeMin: new Date(2026, 1, 28),
      timeMax: new Date(2026, 3, 30),
    });
  });

  it("selects the widest range needed by mapped destinations", () => {
    expect(getWiderSyncRange("3_months", "12_months")).toBe("12_months");
    expect(isSyncRangeWider("2_years", "12_months")).toBe(true);
    expect(isSyncRangeWider("1_week", "1_month")).toBe(false);
  });

  it("falls back to the standard window after a Pro downgrade", () => {
    expect(getEffectiveSyncRanges("free", "12_months", "1_month")).toEqual({
      futureRange: "2_years",
      historicRange: "1_week",
    });
    expect(getEffectiveSyncRanges("pro", "12_months", "1_month")).toEqual({
      futureRange: "1_month",
      historicRange: "12_months",
    });
  });

  it("rejects unrecognized ranges instead of ordering them as narrowest", () => {
    const unsupported = "5_years" as never;

    expect(() => getWiderSyncRange(unsupported, "1_week")).toThrow(
      "Unsupported sync range: 5_years",
    );
    expect(() => isSyncRangeWider(unsupported, "1_week")).toThrow(
      "Unsupported sync range: 5_years",
    );
  });

  it("rejects invalid windows and represents empty intersections as null", () => {
    const boundary = new Date("2026-03-01T00:00:00.000Z");
    expect(() => createSyncWindow(boundary, boundary)).toThrow(
      "Sync window start must be before its end",
    );
    expect(intersectSyncWindows(
      createSyncWindow(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-02-01T00:00:00.000Z"),
      ),
      createSyncWindow(
        new Date("2026-02-01T00:00:00.000Z"),
        new Date("2026-03-01T00:00:00.000Z"),
      ),
    )).toBeNull();
  });
});
