import { assertNoRemovalDerivable } from "@keeper.sh/sync-conformance";
import { describe, expect, test } from "vitest";
import { googleListingLimits } from "../../src/limits";
import { listingOf } from "../support/expect";
import { createHarness, marchWindow, operationContext, scopeOver } from "../support/harness";
import { hundredForeignEvents, seedOf } from "../support/items";

describe("pagination stops at a ceiling a hostile server cannot lift", () => {
  test("GOOG-L2: a server that always returns a page token stops at the ceiling with a continuation", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf(hundredForeignEvents()));
    harness.fake.neverStopPaging();

    const listing = listingOf(
      await harness.provider.listChanges(
        { scope: scopeOver(marchWindow), resume: null },
        operationContext(harness.environment, { deadlineMs: 5000 }),
      ),
    );

    expect(listing.kind).toBe("partial");
    expect(harness.fake.listCallCount()).toBe(googleListingLimits.maxPages);
    assertNoRemovalDerivable(listing);
  }, 5000);

  test("GOOG-L2: the ceiling reports how many pages it actually read", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf(hundredForeignEvents()));
    harness.fake.neverStopPaging();

    const listing = listingOf(
      await harness.provider.listChanges(
        { scope: scopeOver(marchWindow), resume: null },
        operationContext(harness.environment, { deadlineMs: 5000 }),
      ),
    );

    expect(listing.diagnostics.pagesFetched).toBe(googleListingLimits.maxPages);
    expect(listing.continuation?.scope.calendar.calendar.value).toBe("primary");
  }, 5000);
});
