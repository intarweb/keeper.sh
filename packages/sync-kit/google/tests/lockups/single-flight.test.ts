import { describe, expect, test } from "vitest";
import { createHarness, marchWindow, operationContext, scopeOver } from "../support/harness";
import { foreignEvent, seedOf } from "../support/items";

const seeded = () => [
  foreignEvent({ uid: "shared", start: "2026-03-23T09:00:00.000Z", end: "2026-03-23T10:00:00.000Z" }),
];

const threeIdenticalListings = (harness: ReturnType<typeof createHarness>) => {
  const scope = scopeOver(marchWindow);
  return [1, 2, 3].map(() =>
    harness.provider.listChanges({ scope, resume: null }, operationContext(harness.environment)),
  );
};

describe("a coalesced leader's failure reaches every follower", () => {
  test("GOOG-L4: a leader that throws rejects all three followers and empties the map", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf(seeded()));
    harness.environment.transport.answerWith({ kind: "throw", times: 1 });

    const settled = await Promise.allSettled(threeIdenticalListings(harness));

    expect(settled.map((entry) => entry.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(
      settled.flatMap((entry) => {
        if (entry.status !== "fulfilled") {
          return [];
        }
        return [entry.value.ok];
      }),
    ).toEqual([false, false, false]);
  });

  test("GOOG-L4: the next listing after a failed leader is not poisoned by it", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf(seeded()));
    harness.environment.transport.answerWith({ kind: "throw", times: 1 });
    await Promise.allSettled(threeIdenticalListings(harness));

    const afterwards = await harness.provider.listChanges(
      { scope: scopeOver(marchWindow), resume: null },
      operationContext(harness.environment),
    );

    expect(afterwards.ok).toBe(true);
  });

  test("GOOG-L4: three coalesced callers reach the transport once", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf(seeded()));

    await Promise.all(threeIdenticalListings(harness));

    expect(harness.fake.listCallCount()).toBe(1);
  });

  test("GOOG-L4: coalesced callers do not share one diagnostics object", async () => {
    const harness = createHarness();
    harness.fake.seedFromProvider(seedOf(seeded()));

    const [first, second] = await Promise.all(threeIdenticalListings(harness));

    if (!first?.ok || !second?.ok) {
      throw new Error("a coalesced listing failed where it had to succeed");
    }
    expect(first.value.diagnostics).not.toBe(second.value.diagnostics);
  });
});
