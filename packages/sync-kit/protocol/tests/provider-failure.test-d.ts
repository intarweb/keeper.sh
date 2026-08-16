import { describe, expectTypeOf, test } from "vitest";
import { assertNever } from "../src/index";
import type {
  AccountId,
  Instant,
  NotAttemptedReason,
  ProviderFailure,
  QuotaScope,
} from "../src/index";

declare const scope: QuotaScope;
declare const account: AccountId;

declare const acceptFailure: (failure: ProviderFailure) => void;

describe("failure is typed, never free text", () => {
  test("a ProviderFailure switch that omits reauthRequired fails to compile", () => {
    const isRetryable = (failure: ProviderFailure): boolean => {
      switch (failure.kind) {
        case "rateLimited":
        case "truncated": {
          return true;
        }
        case "cursorInvalid":
        case "conflict":
        case "notFound":
        case "unsupported":
        case "notAttempted": {
          return false;
        }
        case "transport": {
          return failure.retryable;
        }
        default: {
          // @ts-expect-error reauth retried as a transient error burns quota and never succeeds
          return assertNever(failure);
        }
      }
    };
    expectTypeOf(isRetryable).returns.toBeBoolean();
  });

  test("reauthRequired names the account that must reauthenticate", () => {
    expectTypeOf<{ readonly kind: "reauthRequired"; readonly account: AccountId }>().toExtend<
      ProviderFailure
    >();
    acceptFailure({ kind: "reauthRequired", account });
  });

  test("rateLimited.retryAfter is Instant | null, never undefined", () => {
    expectTypeOf<
      Extract<ProviderFailure, { kind: "rateLimited" }>["retryAfter"]
    >().toEqualTypeOf<Instant | null>();
    // @ts-expect-error the absent case must be an explicit branch, not a forgotten field
    acceptFailure({ kind: "rateLimited", scope });
  });

  test("a failure carries no free-text message to classify on", () => {
    acceptFailure({
      kind: "transport",
      status: 503,
      retryable: true,
      // @ts-expect-error classifying by message substring is how reauth was missed for months
      message: "service unavailable",
    });
  });

  test("an unattempted operation reports one of the shared, typed reasons", () => {
    expectTypeOf<
      Extract<ProviderFailure, { kind: "notAttempted" }>["reason"]
    >().toEqualTypeOf<NotAttemptedReason>();
  });
});
