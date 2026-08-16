import { describe, expectTypeOf, test } from "vitest";
import type {
  AccountId,
  CalendarEnumeration,
  CalendarProvider,
  ChangeListing,
  EditableContent,
  Instant,
  ListChangesRequest,
  NormalizedContent,
  OperationContext,
  Result,
  RetryBudget,
  WriteIntent,
  WriteOutcome,
} from "../src/index";

declare const now: () => Instant;
declare const signal: AbortSignal;
declare const absentSignal: undefined;
declare const retryBudget: RetryBudget;

declare const acceptContext: (context: OperationContext) => void;
declare const acceptRetryBudget: (budget: RetryBudget) => void;
declare const acceptProvider: (provider: CalendarProvider<"google">) => void;
declare const acceptNormalized: (content: NormalizedContent<"google">) => void;
declare const rawContent: EditableContent;

declare const candidateWithBareWrite: {
  readonly capabilities: CalendarProvider<"google">["capabilities"];
  readonly listCalendars: CalendarProvider<"google">["listCalendars"];
  readonly listChanges: CalendarProvider<"google">["listChanges"];
  readonly normalize: CalendarProvider<"google">["normalize"];
  readonly write: (intent: WriteIntent<"google">) => Promise<WriteOutcome>;
};

describe("nothing in the contract can wedge", () => {
  test("every awaiting operation takes an OperationContext", () => {
    expectTypeOf<Parameters<CalendarProvider["listCalendars"]>>().toEqualTypeOf<
      [AccountId, OperationContext]
    >();
    expectTypeOf<Parameters<CalendarProvider["listChanges"]>>().toEqualTypeOf<
      [ListChangesRequest, OperationContext]
    >();
    expectTypeOf<Parameters<CalendarProvider["write"]>>().toEqualTypeOf<
      [WriteIntent, OperationContext]
    >();
  });

  test("OperationContext.signal cannot be omitted or undefined", () => {
    expectTypeOf<OperationContext>().toHaveProperty("signal").toEqualTypeOf<AbortSignal>();
    // @ts-expect-error a remote await with no cancellation path is a hang waiting to happen
    acceptContext({ now, retryBudget });
    // @ts-expect-error an optional signal is a signal somebody will forget to pass
    acceptContext({ signal: absentSignal, now, retryBudget });
  });

  test("an OperationContext cannot be constructed without a retry budget", () => {
    // @ts-expect-error retries left to the adapter's discretion are where the ceiling gets lost
    acceptContext({ signal, now });
  });

  test("a RetryBudget without maxAttempts does not compile", () => {
    // @ts-expect-error an unbounded retry loop burns an hour of quota per calendar
    acceptRetryBudget({ ceilingMs: 64_000 });
    expectTypeOf<RetryBudget["maxAttempts"]>().toEqualTypeOf<number>();
    expectTypeOf<RetryBudget["ceilingMs"]>().toEqualTypeOf<number>();
  });

  test("no awaiting method returns a bare value; every one returns a Result", () => {
    expectTypeOf<CalendarProvider["listCalendars"]>().returns.toEqualTypeOf<
      Promise<Result<CalendarEnumeration>>
    >();
    expectTypeOf<CalendarProvider["listChanges"]>().returns.toEqualTypeOf<
      Promise<Result<ChangeListing>>
    >();
    expectTypeOf<CalendarProvider["write"]>().returns.toEqualTypeOf<
      Promise<Result<WriteOutcome>>
    >();
    expectTypeOf<CalendarProvider["normalize"]>().returns.toEqualTypeOf<
      Result<NormalizedContent<string>>
    >();
  });

  test("a provider whose write resolves a bare outcome does not satisfy the contract", () => {
    // @ts-expect-error a thrown or untyped failure is how reauth became an infinite retry
    acceptProvider(candidateWithBareWrite);
  });

  test("normalization is a declared phase of the contract", () => {
    expectTypeOf<Parameters<CalendarProvider["normalize"]>>().toEqualTypeOf<[EditableContent]>();
    // @ts-expect-error only provider.normalize may mint normalized content
    acceptNormalized(rawContent);
  });
});
