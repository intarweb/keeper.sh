import type {
  Capabilities,
  ChangeListing,
  ListingScope,
  TimeWindow,
  ProviderId,
  Result,
} from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId } from "../case-id";
import { conformanceCaseIds } from "../case-id";
import { conformanceLimits } from "../limits";
import type { CaseContext } from "../registry/case";
import type { ConformanceCase } from "../registry/case";
import {
  caseScope,
  defineCase,
  failureKindOf,
  foreignEvent,
  insist,
  listChanges,
  seedWith,
} from "./support";

const notAttemptedReasonOf = (answered: Result<ChangeListing>): string => {
  if (answered.ok) {
    return "ok";
  }
  const { failure } = answered;
  if (failure.kind !== "notAttempted") {
    return `not-a-notAttempted:${failure.kind}`;
  }
  return failure.reason;
};

const abortedSignal = (): AbortSignal => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};

const dayMs = 24 * 60 * 60 * 1000;

const windowFor = (id: ConformanceCaseId): TimeWindow => {
  const start = Date.parse("2026-06-01T00:00:00.000Z") + conformanceCaseIds.indexOf(id) * 40 * dayMs;
  return {
    start: { kind: "instant", value: new Date(start).toISOString() },
    end: { kind: "instant", value: new Date(start + 31 * dayMs).toISOString() },
  };
};

const seedOne = async <Provider extends ProviderId>(
  context: CaseContext<Provider>,
  name: ConformanceCaseId,
): Promise<ListingScope> => {
  const scope = caseScope(context, windowFor(name));
  await seedWith(context, [
    foreignEvent(scope.calendar, {
      uid: `${name}:alpha`,
      start: "2026-03-02T09:00:00.000Z",
      end: "2026-03-02T10:00:00.000Z",
    }),
  ]);
  return scope;
};

const concurrently = <Provider extends ProviderId>(
  context: CaseContext<Provider>,
  scope: ListingScope,
  callers: number,
): readonly Promise<Result<ChangeListing>>[] =>
  Array.from({ length: callers }, () => listChanges(context, scope));

const lockupCases = <Provider extends ProviderId>(
  supports: Capabilities<Provider>,
): readonly ConformanceCase<Provider>[] => [
  defineCase(
    supports,
    "CONF-L1",
    "a retry path stops at the attempt ceiling it was given",
    async (context) => {
      const scope = await seedOne(context, "CONF-L1");
      context.environment.transport.answerWith({
        kind: "reject",
        failure: { kind: "rateLimited", retryAfter: null, scope: supports.quotaScope },
        times: 1,
      });

      const answered = await listChanges(context, scope, null, {
        maxAttempts: 1,
        retryDelayCeilingMs: 1,
      });
      context.environment.transport.answerWith({ kind: "pass" });

      insist(
        "CONF-L1",
        failureKindOf(answered) === "rateLimited",
        "an operation given a single attempt tried again anyway",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L2",
    "an operation with no budget left settles instead of waiting on a transport that never answers",
    async (context) => {
      const scope = await seedOne(context, "CONF-L2");
      context.environment.transport.stall();

      const answered = await listChanges(context, scope, null, { deadlineMs: 0 });
      context.environment.transport.resume();

      insist(
        "CONF-L2",
        notAttemptedReasonOf(answered) === "budgetExhausted",
        "an exhausted budget was reported as something other than an exhausted budget",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L3",
    "a caller's abort is reported as an abort, never as a provider timeout",
    async (context) => {
      const scope = await seedOne(context, "CONF-L3");
      context.environment.transport.stall();

      const answered = await listChanges(context, scope, null, { signal: abortedSignal() });
      context.environment.transport.resume();

      insist(
        "CONF-L3",
        notAttemptedReasonOf(answered) === "aborted",
        "a caller's cancellation was misattributed to the provider",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L4",
    "a single-flight leader's failure reaches every follower",
    async (context) => {
      const scope = await seedOne(context, "CONF-L4");
      context.environment.transport.answerWith({ kind: "throw", times: 1 });

      const settled = await Promise.allSettled(concurrently(context, scope, 3));
      context.environment.transport.answerWith({ kind: "pass" });

      insist(
        "CONF-L4",
        settled.length === 3,
        "a coalesced caller never received an answer at all",
      );
      insist(
        "CONF-L4",
        settled.every((entry) => entry.status === "fulfilled" && !entry.value.ok),
        "a follower behind a failed leader was told the run succeeded",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L5",
    "coalesced callers each get their own diagnostics",
    async (context) => {
      const scope = await seedOne(context, "CONF-L5");

      const [leading, following] = await Promise.all(concurrently(context, scope, 2));
      if (!leading?.ok || !following?.ok) {
        throw new Error("CONF-L5 needs two successful listings to compare");
      }

      insist(
        "CONF-L5",
        leading.value.diagnostics !== following.value.diagnostics,
        "two coalesced callers were handed one diagnostics object to share",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L6",
    "concurrent calls over overlapping key sets do not deadlock or cross answers",
    async (context) => {
      const scope = await seedOne(context, "CONF-L6");
      const other = caseScope(context, {
        start: scope.window.end,
        end: { kind: "instant", value: new Date(Date.parse(scope.window.end.value) + dayMs).toISOString() },
      });

      const forward = Promise.all([listChanges(context, scope), listChanges(context, other)]);
      const backward = Promise.all([listChanges(context, other), listChanges(context, scope)]);
      const [firstPair, secondPair] = await Promise.all([forward, backward]);
      const answers = [
        { answered: firstPair[0], asked: scope },
        { answered: firstPair[1], asked: other },
        { answered: secondPair[0], asked: other },
        { answered: secondPair[1], asked: scope },
      ];

      insist(
        "CONF-L6",
        answers.every((entry) => entry.answered.ok),
        "a caller in one of the two orders never got an answer it could use",
      );
      insist(
        "CONF-L6",
        answers.every(
          (entry) =>
            !entry.answered.ok ||
            entry.answered.value.scope.window.start.value === entry.asked.window.start.value,
        ),
        "two concurrent calls over different windows were answered with each other's listing",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L7",
    "a lease taken by a throwing body is released",
    async (context) => {
      const scope = await seedOne(context, "CONF-L7");
      context.environment.transport.answerWith({ kind: "throw", times: 1 });
      await listChanges(context, scope);

      context.environment.transport.answerWith({ kind: "pass" });
      const afterwards = await listChanges(context, scope);

      insist(
        "CONF-L7",
        afterwards.ok,
        "the operation after a throwing one inherited the dead attempt instead of starting its own",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L8",
    "no timer survives a completed operation",
    async (context) => {
      const scope = await seedOne(context, "CONF-L8");

      await listChanges(context, scope);

      insist(
        "CONF-L8",
        context.environment.clock.pendingTimers() === 0,
        "an operation that has already answered left a timer armed behind it",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L9",
    "an aborted waiter does not strand the waiters beside it",
    async (context) => {
      const scope = await seedOne(context, "CONF-L9");

      const first = listChanges(context, scope);
      const second = listChanges(context, scope);
      const cancelled = listChanges(context, scope, null, { signal: abortedSignal() });
      const settled = await Promise.all([first, second, cancelled]);

      const [first_, second_, cancelled_] = settled;
      insist(
        "CONF-L9",
        first_?.ok === true && second_?.ok === true,
        "one caller's cancellation was charged to the callers beside it",
      );
      insist(
        "CONF-L9",
        cancelled_?.ok === false,
        "the aborted caller was answered as if it had run",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L10",
    "an aborted task in a fan-out does not cost the tasks beside it their turn",
    async (context) => {
      const scope = await seedOne(context, "CONF-L10");

      const beside = concurrently(context, scope, conformanceLimits.fanOutTasks - 1);
      const cancelled = listChanges(context, scope, null, { signal: abortedSignal() });
      const settled = await Promise.allSettled([...beside, cancelled]);
      const afterwards = await listChanges(context, scope);

      insist(
        "CONF-L10",
        settled.length === conformanceLimits.fanOutTasks,
        "the fan-out lost a task",
      );
      insist(
        "CONF-L10",
        settled.slice(0, -1).every((entry) => entry.status === "fulfilled" && entry.value.ok),
        "an aborted task cost the tasks beside it their turn",
      );
      insist(
        "CONF-L10",
        afterwards.ok,
        "an aborted task leaked the permit the operation after it needed",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L11",
    "a fan-out returns one result per task and never exceeds the declared concurrency",
    async (context) => {
      const scope = await seedOne(context, "CONF-L11");

      const settled = await Promise.allSettled(
        concurrently(context, scope, conformanceLimits.fanOutTasks),
      );

      insist(
        "CONF-L11",
        settled.length === conformanceLimits.fanOutTasks,
        "the fan-out returned fewer results than it was given tasks",
      );
      insist(
        "CONF-L11",
        settled.every((entry) => entry.status === "fulfilled"),
        "one task in the fan-out rejected instead of answering",
      );
      insist(
        "CONF-L11",
        context.environment.transport.inFlightPeak() <= conformanceLimits.concurrency,
        "the fan-out ran more work at once than the concurrency it declared",
      );
    },
  ),

  defineCase(
    supports,
    "CONF-L12",
    "an unattempted run is a third state, not a success and not a failure",
    async (context) => {
      const scope = await seedOne(context, "CONF-L12");
      const callsBefore = context.environment.transport.callCount();

      const answered = await listChanges(context, scope, null, { signal: abortedSignal() });

      insist(
        "CONF-L12",
        !answered.ok && answered.failure.kind === "notAttempted",
        "a run aborted before it began was reported as an attempt",
      );
      insist(
        "CONF-L12",
        context.environment.transport.callCount() === callsBefore,
        "a run aborted before it began still reached the transport",
      );
    },
  ),
];

export { abortedSignal, lockupCases, notAttemptedReasonOf };
