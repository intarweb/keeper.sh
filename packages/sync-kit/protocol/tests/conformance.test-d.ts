import { describe, expectTypeOf, test } from "vitest";
import type { FingerprintContract, ProviderConformanceSuite } from "../src/index";

declare const obligation: () => void;
declare const acceptSuite: (suite: ProviderConformanceSuite) => void;

describe("obligations the compiler cannot check are still named here", () => {
  test("the conformance suite names every lockup obligation an adapter must prove", () => {
    expectTypeOf<keyof ProviderConformanceSuite>().toEqualTypeOf<
      | "leaseReleasedOnThrow"
      | "followerRejectsWhenLeaderFails"
      | "deadlineOnNeverResolvingStub"
      | "abortMidFlightCleansUp"
      | "retryCeilingProven"
      | "concurrentSameKeyDoesNotDeadlock"
    >();
  });

  test("a suite that omits an obligation does not satisfy the contract", () => {
    // @ts-expect-error an adapter cannot ship without proving its lease releases on a throw
    acceptSuite({
      deadlineOnNeverResolvingStub: obligation,
      abortMidFlightCleansUp: obligation,
      retryCeilingProven: obligation,
      concurrentSameKeyDoesNotDeadlock: obligation,
      followerRejectsWhenLeaderFails: obligation,
    });
  });

  test("the fingerprint contract states the canonicalisation adapters must share", () => {
    expectTypeOf<FingerprintContract["canonicalisation"]>().toEqualTypeOf<"rfc8785">();
    expectTypeOf<FingerprintContract>().toHaveProperty("comparableFields");
  });
});
