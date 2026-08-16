import { describe, expect, test } from "vitest";
import { assembleSeries } from "../../src/listing/assemble-series";
import { listingOf } from "../support/expect";
import { createHarness, marchWindow, operationContext, scopeOver } from "../support/harness";
import { seriesMaster, timedItem } from "../support/items";

const master = seriesMaster("weekly", "RRULE:FREQ=WEEKLY;COUNT=4", "2026-03-02T09:00:00.000Z");

const override = {
  ...timedItem({
    id: "weekly_20260309T090000Z",
    uid: "weekly@google.com",
    start: "2026-03-09T14:00:00.000Z",
    end: "2026-03-09T15:00:00.000Z",
  }),
  recurringEventId: "weekly",
  originalStartTime: { dateTime: "2026-03-09T09:00:00.000Z", timeZone: "UTC" },
};

describe("a master and its overrides reassemble across pages", () => {
  test("GOOG-O19: an override arriving before its master on an earlier page assembles into one series", async () => {
    const harness = createHarness();
    harness.fake.putItems([override, master]);
    harness.fake.pageEvery(1);

    const listing = listingOf(
      await harness.provider.listChanges(
        { scope: scopeOver(marchWindow), resume: null },
        operationContext(harness.environment),
      ),
    );

    expect(listing.events).toHaveLength(1);
    expect(listing.events?.at(0)?.content.recurrence?.value).toBe("RRULE:FREQ=WEEKLY;COUNT=4");
  });

  test("GOOG-O19: assembly is order independent", () => {
    const overrideFirst = assembleSeries([override, master]);
    const masterFirst = assembleSeries([master, override]);

    expect(overrideFirst).toEqual(masterFirst);
    expect(overrideFirst.series).toHaveLength(1);
    expect(overrideFirst.series.at(0)?.overrides).toHaveLength(1);
  });

  test("GOOG-O19: an override whose master never arrived is reported, never invented", () => {
    const assembled = assembleSeries([override]);

    expect(assembled.series).toEqual([]);
    expect(assembled.orphanedOverrides).toEqual([
      { seriesId: "weekly", originalStart: "2026-03-09T09:00:00.000Z" },
    ]);
  });
});
