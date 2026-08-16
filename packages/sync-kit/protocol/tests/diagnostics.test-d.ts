import { describe, expectTypeOf, test } from "vitest";
import type { BoundedSample, ListingDiagnostics } from "../src/index";

declare const identifiers: readonly string[];
declare const sample: BoundedSample;

declare const acceptSample: (bounded: BoundedSample) => void;
declare const acceptDiagnostics: (diagnostics: ListingDiagnostics) => void;
declare const acceptBoundedShape: (bounded: {
  readonly sample: readonly string[];
  readonly total: number;
}) => void;

describe("a discard always leaves a trace that survives truncation", () => {
  test("an identifier diagnostic is never a bare array", () => {
    // @ts-expect-error an uncapped list pushes the wide event past its size limit
    acceptSample(identifiers);
    expectTypeOf<BoundedSample>().toEqualTypeOf<{
      readonly sample: readonly string[];
      readonly total: number;
    }>();
  });

  test("the counters are required, not optional", () => {
    // @ts-expect-error an adapter must answer how many of its own events it saw
    acceptDiagnostics({ withheld: sample, unrepresentable: sample, pagesFetched: 3 });
    expectTypeOf<ListingDiagnostics["pagesFetched"]>().toEqualTypeOf<number>();
  });

  test("selfAuthored and unrepresentable are separate counters", () => {
    expectTypeOf<keyof ListingDiagnostics>().toEqualTypeOf<
      "withheld" | "selfAuthored" | "unrepresentable" | "pagesFetched"
    >();
  });

  test("a bounded sample keeps the total beside the sample it truncated", () => {
    acceptBoundedShape(sample);
  });
});
