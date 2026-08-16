import { describe, expect, test } from "vitest";
import { indexMappings, planReconciliation } from "../../src/index";
import type { KnownEvent, Mapping } from "../../src/index";
import {
  knownEvent,
  knownState,
  mapping,
  mappingSet,
  policy,
  slotIdentity,
  snapshotListing,
  sourceOnly,
  timedAt,
  unprovenPolicy,
} from "../support/fixtures";

const spanFor = (index: number) => {
  const start = new Date(Date.UTC(2026, 2, 1, 0, 0, 0) + index * 60_000).toISOString();
  const end = new Date(Date.UTC(2026, 2, 1, 0, 30, 0) + index * 60_000).toISOString();
  return { start, end };
};

const identityAt = (index: number) => {
  const span = spanFor(index);
  return slotIdentity(`evt-${index}`, span.start, span.end);
};

const knownEventsOf = (count: number): readonly KnownEvent[] =>
  Array.from({ length: count }, (unused, index) => {
    const span = spanFor(index);
    return knownEvent({ identity: identityAt(index), time: timedAt(span.start, span.end) });
  });

const mappingsOf = (count: number): readonly Mapping[] =>
  Array.from({ length: count }, (unused, index) =>
    mapping({ identity: identityAt(index), destinationId: `mirror-${index}` }),
  );

const planOver = (count: number) =>
  planReconciliation(
    sourceOnly(snapshotListing({ events: [] })),
    knownState(knownEventsOf(count)),
    mappingSet(mappingsOf(count)),
    unprovenPolicy(),
  );

describe("a large calendar is a single pass, not a nested scan", () => {
  test("RECON-L6: a hundred thousand known events against an empty listing completes", () => {
    const plan = planOver(100_000);

    expect(plan.unresolved).toHaveLength(100_000);
  }, 60_000);

  test("RECON-L6: the mapping index is built once and answers by lookup", () => {
    const indexes = indexMappings(mappingSet(mappingsOf(50_000)));

    expect(indexes.bySourceIdentity.size).toBe(50_000);
    expect(indexes.byDestinationId.size).toBe(50_000);
    expect(indexes.ambiguousSourceKeys).toEqual([]);
  });

  test("RECON-L6: doubling the state does not quadruple the work, measured as the fastest of five passes", () => {
    const fastest = (count: number): number => {
      const samples = [0, 1, 2, 3, 4].map(() => {
        const startedAt = performance.now();
        planOver(count);
        return performance.now() - startedAt;
      });
      return Math.min(...samples);
    };

    const small = fastest(20_000);
    const large = fastest(40_000);

    expect(large).toBeLessThan(small * 3);
  }, 120_000);

  test("RECON-L6: proven coverage over a large state tombstones every row without a nested scan", () => {
    const plan = planReconciliation(
      sourceOnly(snapshotListing({ events: [] })),
      knownState(knownEventsOf(20_000)),
      mappingSet(mappingsOf(20_000)),
      policy(),
    );

    expect(plan.tombstones).toHaveLength(20_000);
  }, 60_000);
});
