import type {
  AccountId,
  CalendarEnumeration,
  ChangeListing,
  Continuation,
  CoverageWindow,
  EchoVerdict,
  EditableContent,
  EventUid,
  Instant,
  ListChangesRequest,
  ListingDiagnostics,
  ListingScope,
  NormalizedContent,
  OperationContext,
  ProviderFailure,
  RemoteEvent,
  RemoteRef,
  Removal,
  Result,
  SyncCursor,
  WithheldEvent,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { ConformanceCaseId } from "../case-id";
import type { KeyOrder } from "../canonical";
import { canonicalise, insertionOrderKeys, sortedKeys } from "../canonical";
import type { DeadlineAnswers } from "../deadline";
import { raceDeadline, standardAnswers } from "../deadline";
import { conformanceLimits } from "../limits";
import type { ConformanceEnvironment, ProviderSeed, ProviderUnderTest } from "../options";
import { createSingleFlight } from "../single-flight";
import { failureOfTransportError } from "../transport";
import { referenceCalendar } from "./calendar";
import { referenceCapabilities } from "./capabilities";
import { createCursorMint, scopeKeyOf } from "./cursor";
import type { Defect } from "./defect";
import { defectIs, isMarked } from "./defect";
import { encodeIdentity, fingerprintWith, referenceFingerprintContract } from "./fingerprint";
import type { ResolvedFeed } from "./listing";
import {
  admitsAnything,
  coverageOver,
  cursorLostListing,
  diagnosticsOf,
  emptySnapshot,
  identitiesOf,
  removalsAgainst,
  resolveFeed,
} from "./listing";
import { constraintViolatedBy, rewriteAsProviderWould } from "./normalize";
import type { ReportedIdentity } from "./store";
import { createReferenceStore } from "./store";

interface ReferenceOptions {
  readonly environment: ConformanceEnvironment;
  readonly defect: Defect;
}

const remoteRefFor = (uid: string): RemoteRef => ({
  id: { kind: "remoteEventId", value: `id-${uid}` },
  deleteHandle: { kind: "deleteHandle", value: `handle-${uid}` },
});

const versionFor = (uid: string, revision: number): string => `v${revision}-${uid}`;

const isRetryable = (failure: ProviderFailure): boolean => failure.kind === "rateLimited";

const retryDelayFor = (failure: ProviderFailure, context: OperationContext): number => {
  const ceiling = context.retryBudget.retryDelayCeilingMs;
  if (failure.kind !== "rateLimited" || failure.retryAfter === null) {
    return ceiling;
  }
  const asked = Date.parse(failure.retryAfter.value) - Date.parse(context.now().value);
  return Math.max(0, Math.min(ceiling, asked));
};

const aborted: ProviderFailure = { kind: "notAttempted", reason: "aborted" };
const exhausted: ProviderFailure = { kind: "notAttempted", reason: "budgetExhausted" };

const withheldExcept = (
  withheld: readonly WithheldEvent[],
  excluded: (entry: WithheldEvent) => boolean,
): readonly WithheldEvent[] => withheld.filter((entry) => !excluded(entry));

const unnamedRemoval = (): Removal => ({
  kind: "outOfScope",
  id: { kind: "remoteEventId", value: "id-unnamed" },
});

const truncatedAsPartial = (
  scope: ListingScope,
  feed: ResolvedFeed,
  diagnostics: ListingDiagnostics,
): ChangeListing => ({
  kind: "partial",
  scope,
  events: feed.events,
  withheld: feed.withheld,
  continuation: { kind: "continuation", value: "defective", scope },
  diagnostics,
});

const noop = (): null => null;

const answeredWith = <Value>(value: Value): Promise<Value> => Promise.resolve(value);

const staleConflict = (existing: RemoteEvent): Result<WriteOutcome> => ({
  ok: false,
  failure: {
    kind: "conflict",
    observed: { kind: "matchesVersion", version: existing.version },
  },
});

const createReference = (options: ReferenceOptions): ProviderUnderTest<"reference"> => {
  const { environment, defect } = options;
  const store = createReferenceStore(referenceCalendar);
  const mint = createCursorMint(environment.hash);
  const flights = createSingleFlight<Result<ChangeListing>>({
    retain: (settled) =>
      defectIs(defect, "CONF-L7") &&
      !settled.ok &&
      settled.failure.kind === "transport" &&
      settled.failure.status === null,
  });
  const lifetime = new AbortController();
  const poisoned = new Set<string>();
  let deltaFloor = 0;
  let carriedPages = 0;
  let leakedPermits = 0;
  let callersInFlight = 0;
  let abortsInBurst = 0;

  const observedAt = (): Instant => {
    if (defectIs(defect, "CONF-L13")) {
      return { kind: "instant", value: "1970-01-01T00:00:00.000Z" };
    }
    return environment.clock.now();
  };

  const indeterminate = (event: RemoteEvent): RemoteEvent => {
    if (!isMarked(event.uid.value, "CONF-O16")) {
      return event;
    }
    return {
      id: event.id,
      deleteHandle: event.deleteHandle,
      uid: event.uid,
      calendar: event.calendar,
      revision: event.revision,
      version: event.version,
      content: event.content,
      fingerprint: event.fingerprint,
      provenance: { kind: "indeterminate" },
    };
  };

  const phantom = (): RemoteEvent => ({
    ...remoteRefFor("CONF-O3:ghost"),
    uid: { kind: "eventUid", value: "CONF-O3:ghost" },
    calendar: referenceCalendar,
    revision: 1,
    version: { kind: "remoteVersion", value: "v1-phantom" },
    content: {
      title: "Phantom",
      description: null,
      location: null,
      availability: "busy",
      visibility: "default",
      recurrence: null,
      time: {
        kind: "timed",
        start: { kind: "instant", value: "2026-03-15T09:00:00.000Z" },
        end: { kind: "instant", value: "2026-03-15T10:00:00.000Z" },
        zone: null,
      },
    },
    fingerprint: { kind: "fingerprint", value: "phantom" },
    provenance: { kind: "foreign" },
  });

  const markedIn = (id: ConformanceCaseId): readonly RemoteEvent[] =>
    store.objects().filter((event) => isMarked(event.uid.value, id));

  const unmarkedFeed = (id: ConformanceCaseId): ResolvedFeed =>
    resolveFeed(store.objects().filter((event) => !isMarked(event.uid.value, id)));

  const resolvedFeed = (): ResolvedFeed => {
    if (defectIs(defect, "CONF-O22")) {
      const resolved = resolveFeed(store.objects());
      return {
        events: [...resolved.events, ...markedIn("CONF-O22")],
        withheld: resolved.withheld,
      };
    }
    if (defectIs(defect, "CONF-O8")) {
      const rest = unmarkedFeed("CONF-O8");
      const last = markedIn("CONF-O8").at(-1);
      if (!last) {
        return rest;
      }
      return { events: [...rest.events, last], withheld: rest.withheld };
    }
    if (defectIs(defect, "CONF-O7")) {
      const rest = unmarkedFeed("CONF-O7");
      const oldest = markedIn("CONF-O7").filter((event) => event.revision === 1);
      return { events: [...rest.events, ...oldest], withheld: rest.withheld };
    }
    return resolveFeed(store.objects());
  };

  const defectiveFeed = (feed: ResolvedFeed): ResolvedFeed => {
    if (defectIs(defect, "CONF-O1")) {
      const marked = feed.events.filter((event) => isMarked(event.uid.value, "CONF-O1"));
      const kept = feed.events.filter((event) => !isMarked(event.uid.value, "CONF-O1"));
      return { events: [...kept, ...marked.slice(0, 1)], withheld: feed.withheld };
    }
    if (defectIs(defect, "CONF-O3") && markedIn("CONF-O3").length > 0) {
      return { events: [...feed.events, phantom()], withheld: feed.withheld };
    }
    if (defectIs(defect, "CONF-O5")) {
      return {
        events: feed.events,
        withheld: withheldExcept(feed.withheld, (entry) =>
          isMarked(entry.uid?.value ?? "", "CONF-O5"),
        ),
      };
    }
    if (defectIs(defect, "CONF-O16")) {
      return { events: feed.events.map(indeterminate), withheld: feed.withheld };
    }
    if (defectIs(defect, "CONF-O26")) {
      return {
        events: feed.events.filter((event) => !isMarked(event.uid.value, "CONF-O26")),
        withheld: feed.withheld,
      };
    }
    if (defectIs(defect, "CONF-O27")) {
      return {
        events: feed.events.filter((event) => !event.uid.value.endsWith(":lower")),
        withheld: feed.withheld,
      };
    }
    if (defectIs(defect, "CONF-O28")) {
      const degenerate = feed.events.filter((event) => isMarked(event.uid.value, "CONF-O28"));
      return {
        events: feed.events.filter((event) => !isMarked(event.uid.value, "CONF-O28")),
        withheld: [
          ...feed.withheld,
          ...degenerate.map((event) => ({
            uid: event.uid,
            id: event.id,
            reason: "unrepresentableTime" as const,
          })),
        ],
      };
    }
    if (defectIs(defect, "CONF-O32")) {
      return {
        events: feed.events,
        withheld: withheldExcept(feed.withheld, (entry) => entry.uid === null),
      };
    }
    return feed;
  };

  const evictedMirror = (feed: ResolvedFeed): ResolvedFeed => {
    if (!defectIs(defect, "CONF-O33") || feed.withheld.length === 0) {
      return feed;
    }
    store.replaceObjects(
      store.objects().filter((event) => !event.uid.value.endsWith(":mirror")),
    );
    return defectiveFeed(resolvedFeed());
  };

  const feedNow = (): ResolvedFeed => evictedMirror(defectiveFeed(resolvedFeed()));

  const titleBehind = (id: string): string => {
    const found = store.objects().find((event) => event.id.value === id);
    if (!found) {
      return id;
    }
    return found.content.title;
  };

  const diagnosticsFor = (feed: ResolvedFeed): ListingDiagnostics => {
    const honest = diagnosticsOf(feed, environment.installation);
    if (defectIs(defect, "CONF-O19")) {
      return {
        ...honest,
        withheld: {
          sample: feed.withheld
            .filter((entry) => isMarked(entry.uid?.value ?? "", "CONF-O19"))
            .map((entry) => titleBehind(entry.id?.value ?? ""))
            .toSpliced(-0, 0, ...honest.withheld.sample),
          total: honest.withheld.total,
        },
      };
    }
    if (defectIs(defect, "CONF-O30")) {
      return {
        ...honest,
        unrepresentable: {
          sample: [...honest.unrepresentable.sample, ...honest.selfAuthored.sample],
          total: honest.unrepresentable.total + honest.selfAuthored.total,
        },
      };
    }
    if (defectIs(defect, "CONF-O31")) {
      return {
        ...honest,
        withheld: {
          sample: feed.withheld.map((entry) => entry.uid?.value ?? entry.id?.value ?? ""),
          total: honest.withheld.total,
        },
      };
    }
    if (defectIs(defect, "CONF-O42")) {
      return { ...honest, pagesFetched: honest.pagesFetched + carriedPages };
    }
    return honest;
  };

  const anonymised = (removal: Removal): Removal => {
    if (removal.kind === "outOfScope") {
      return removal;
    }
    const blanked: EventUid = { kind: "eventUid", value: "" };
    return { ...removal, uid: blanked };
  };

  const marksCase = (removal: Removal, id: ConformanceCaseId): boolean => {
    if (removal.kind === "outOfScope") {
      return false;
    }
    return isMarked(removal.uid.value, id);
  };

  const removalsFor = (present: readonly ReportedIdentity[]): readonly Removal[] => {
    const honest = removalsAgainst(store.reported(), present);
    if (defectIs(defect, "CONF-O13")) {
      return honest.map((removal) => {
        if (!marksCase(removal, "CONF-O13")) {
          return removal;
        }
        return anonymised(removal);
      });
    }
    if (defectIs(defect, "CONF-O34") && honest.some((removal) => marksCase(removal, "CONF-O34"))) {
      return [...honest, unnamedRemoval()];
    }
    return honest;
  };

  const recordSpuriousWrite = (): void => {
    if (!defectIs(defect, "CONF-O9") || markedIn("CONF-O9").length === 0) {
      return;
    }
    store.record({
      at: observedAt(),
      intent: {
        kind: "retire",
        calendar: { key: referenceCalendar, access: "readWrite" },
        target: { kind: "deleteHandle", value: "handle-spurious" },
        precondition: { kind: "matchesVersion", version: { kind: "remoteVersion", value: "v1" } },
        reason: "outsideWindow",
      },
      outcome: { kind: "deleted", remote: remoteRefFor("spurious") },
    });
  };

  const provenCoverageOf = (scope: ListingScope): CoverageWindow => {
    if (defectIs(defect, "CONF-O4")) {
      return { covered: scope.window, calendar: scope.calendar };
    }
    return coverageOver(scope);
  };

  const snapshotListing = (scope: ListingScope, at: Instant): ChangeListing => {
    const coverage = provenCoverageOf(scope);
    if (!admitsAnything(coverage.covered)) {
      return emptySnapshot(scope, null);
    }
    const feed = feedNow();
    const present = identitiesOf(feed);
    const removals = removalsFor(present);
    store.setReported(present);
    recordSpuriousWrite();
    const diagnostics = diagnosticsFor(feed);
    if (defectIs(defect, "CONF-O41") && markedIn("CONF-O41").length > 0) {
      return truncatedAsPartial(scope, feed, diagnostics);
    }
    return {
      kind: "snapshot",
      scope,
      coverage,
      events: feed.events,
      removals,
      withheld: feed.withheld,
      cursor: mint.mint(scope, store.currentSequence(), at),
      diagnostics,
    };
  };

  const blanked = (event: RemoteEvent): RemoteEvent => {
    if (!defectIs(defect, "CONF-O38") || event.content.recurrence !== null) {
      return event;
    }
    return { ...event, content: { ...event.content, description: null, location: null } };
  };

  const advancedCursor = (
    scope: ListingScope,
    at: Instant,
    resumed: SyncCursor | null,
  ): SyncCursor => {
    if (defectIs(defect, "CONF-O37") && resumed !== null) {
      return resumed;
    }
    return mint.mint(scope, store.currentSequence(), at);
  };

  const deltaListing = (
    scope: ListingScope,
    since: number,
    at: Instant,
    resumed: SyncCursor | null,
  ): ChangeListing => {
    const feed = feedNow();
    const floor = Math.max(since, deltaFloor);
    const present = identitiesOf(feed);
    const removals = removalsFor(present);
    store.setReported(present);
    return {
      kind: "delta",
      scope,
      coverage: coverageOver(scope),
      events: feed.events
        .filter((event) => store.sequenceOf(event.uid.value) > floor)
        .map((event) => blanked(event)),
      removals,
      withheld: feed.withheld,
      cursor: advancedCursor(scope, at, resumed),
      diagnostics: diagnosticsFor(feed),
    };
  };

  const resumedListing = (
    resume: SyncCursor | Continuation,
    scope: ListingScope,
    at: Instant,
  ): Result<ChangeListing> => {
    if (resume.kind === "continuation") {
      return { ok: true, value: snapshotListing(scope, at) };
    }
    const verdict = mint.verify(resume, scope);
    switch (verdict.kind) {
      case "current": {
        return { ok: true, value: deltaListing(scope, verdict.sequence, at, resume) };
      }
      case "superseded": {
        if (defectIs(defect, "CONF-O10")) {
          return { ok: true, value: snapshotListing(scope, at) };
        }
        return { ok: true, value: cursorLostListing(scope) };
      }
      case "foreignScope": {
        if (defectIs(defect, "CONF-O11")) {
          return { ok: true, value: deltaListing(scope, 0, at, resume) };
        }
        return { ok: true, value: cursorLostListing(scope) };
      }
      case "unknown": {
        if (defectIs(defect, "CONF-O40")) {
          throw new Error("the reference mutant cannot read the cursor it was handed");
        }
        return { ok: true, value: cursorLostListing(scope) };
      }
      default: {
        return assertNever(verdict);
      }
    }
  };

  const corruptAnswer = (scope: ListingScope, at: Instant): Result<ChangeListing> => {
    if (defectIs(defect, "CONF-O12")) {
      return { ok: true, value: snapshotListing(scope, at) };
    }
    return { ok: true, value: cursorLostListing(scope) };
  };

  const isUnusable = (event: RemoteEvent): boolean =>
    constraintViolatedBy(event.content) !== null;

  const contentProvokedFailure = (): ProviderFailure | null => {
    if (defectIs(defect, "CONF-O23")) {
      const provoking = store
        .objects()
        .some((event) => event.content.title.toLowerCase().includes("rate limit"));
      if (provoking) {
        return { kind: "rateLimited", retryAfter: null, scope: "perUser" };
      }
    }
    if (defectIs(defect, "CONF-O6") && markedIn("CONF-O6").some((event) => isUnusable(event))) {
      return { kind: "transport", status: 500, disposition: "permanent" };
    }
    return null;
  };

  const buildListing = (request: ListChangesRequest): Result<ChangeListing> => {
    const at = observedAt();
    const provoked = contentProvokedFailure();
    if (provoked !== null) {
      return { ok: false, failure: provoked };
    }
    if (store.corruptKnownRows().length > 0) {
      return corruptAnswer(request.scope, at);
    }
    if (request.resume === null) {
      return { ok: true, value: snapshotListing(request.scope, at) };
    }
    return resumedListing(request.resume, request.scope, at);
  };

  const attemptListing = async (request: ListChangesRequest): Promise<Result<ChangeListing>> => {
    try {
      return await environment.transport.run("listChanges", () =>
        Promise.resolve(buildListing(request)),
      );
    } catch (error) {
      const failure = failureOfTransportError(error);
      if (defectIs(defect, "CONF-O2") && failure.kind === "transport" && failure.status === 503) {
        return { ok: true, value: emptySnapshot(request.scope, null) };
      }
      return { ok: false, failure };
    }
  };

  const sleptBetweenAttempts = async (milliseconds: number): Promise<boolean> => {
    try {
      await environment.clock.sleep(milliseconds, lifetime.signal);
      return true;
    } catch {
      return false;
    }
  };

  const attemptCeiling = (context: OperationContext): number => {
    if (defectIs(defect, "CONF-L1")) {
      return context.retryBudget.maxAttempts + 1;
    }
    return context.retryBudget.maxAttempts;
  };

  const leadListing = async (
    key: string,
    request: ListChangesRequest,
    context: OperationContext,
  ): Promise<Result<ChangeListing>> => {
    const ceiling = attemptCeiling(context);
    for (let attempt = 1; attempt <= ceiling; attempt += 1) {
      const answered = await attemptListing(request);
      if (poisoned.has(key)) {
        poisoned.delete(key);
        return { ok: false, failure: aborted };
      }
      if (answered.ok || !isRetryable(answered.failure) || attempt === ceiling) {
        return answered;
      }
      const slept = await sleptBetweenAttempts(retryDelayFor(answered.failure, context));
      if (!slept) {
        return { ok: false, failure: aborted };
      }
    }
    return { ok: false, failure: exhausted };
  };

  const flightKeyOf = (request: ListChangesRequest): string => {
    if (defectIs(defect, "CONF-L6")) {
      return request.scope.calendar.calendar.value;
    }
    return canonicalise({
      scope: scopeKeyOf(request.scope),
      resume: request.resume?.value ?? "",
    });
  };

  const cloned = (answered: Result<ChangeListing>): Result<ChangeListing> => {
    if (defectIs(defect, "CONF-L5")) {
      return answered;
    }
    return structuredClone(answered);
  };

  const deadlineAnswers = (): DeadlineAnswers => {
    if (defectIs(defect, "CONF-L2")) {
      return { onDeadline: aborted, onAbort: aborted };
    }
    if (defectIs(defect, "CONF-L3")) {
      return { onDeadline: exhausted, onAbort: exhausted };
    }
    return standardAnswers;
  };

  const reattemptedAlone = (
    request: ListChangesRequest,
    answered: Result<ChangeListing>,
  ): Promise<Result<ChangeListing>> => {
    if (answered.ok || !defectIs(defect, "CONF-L4") || answered.failure.kind !== "transport") {
      return Promise.resolve(answered);
    }
    return attemptListing(request);
  };

  const rememberFailure = (answered: Result<ChangeListing>): Result<ChangeListing> => {
    if (answered.ok) {
      return answered;
    }
    if (defectIs(defect, "CONF-O24")) {
      deltaFloor = store.currentSequence();
    }
    if (defectIs(defect, "CONF-O42")) {
      carriedPages += 1;
    }
    return answered;
  };

  const noteAbortedCaller = (key: string, context: OperationContext): void => {
    if (!context.signal.aborted) {
      return;
    }
    if (defectIs(defect, "CONF-L9") && callersInFlight === 3) {
      poisoned.add(key);
    }
    if (defectIs(defect, "CONF-L10") && callersInFlight > conformanceLimits.concurrency) {
      leakedPermits += 1;
    }
  };

  const listChanges = async (
    request: ListChangesRequest,
    context: OperationContext,
  ): Promise<Result<ChangeListing>> => {
    callersInFlight += 1;
    if (callersInFlight === 1) {
      abortsInBurst = 0;
    }
    if (context.signal.aborted) {
      abortsInBurst += 1;
    }
    const key = flightKeyOf(request);
    try {
      noteAbortedCaller(key, context);
      if (leakedPermits > 0 && !context.signal.aborted) {
        leakedPermits -= 1;
        return { ok: false, failure: exhausted };
      }
      if (defectIs(defect, "CONF-L11") && callersInFlight > conformanceLimits.concurrency) {
        await Promise.resolve();
        if (abortsInBurst === 0) {
          throw new Error("the reference mutant dropped a task out of its fan-out");
        }
      }
      if (defectIs(defect, "CONF-L12") && context.signal.aborted) {
        environment.transport.run("listChanges", () => answeredWith(null)).catch(noop);
      }
      const answered = await raceDeadline(context, deadlineAnswers(), () =>
        flights.run(key, () => leadListing(key, request, context)),
      );
      return cloned(rememberFailure(await reattemptedAlone(request, answered)));
    } finally {
      callersInFlight -= 1;
    }
  };

  const normalized = (content: EditableContent): NormalizedContent<"reference"> => {
    if (defectIs(defect, "CONF-O20")) {
      return {
        kind: "normalized",
        provider: "reference",
        content: rewriteAsProviderWould(content),
        fingerprint: fingerprintWith(sortedKeys, content, environment.hash),
      };
    }
    const rewritten = rewriteAsProviderWould(content);
    if (defectIs(defect, "CONF-O21")) {
      return {
        kind: "normalized",
        provider: "reference",
        content: rewritten,
        fingerprint: fingerprintWith(insertionOrderKeys, rewritten, environment.hash),
      };
    }
    return {
      kind: "normalized",
      provider: "reference",
      content: rewritten,
      fingerprint: fingerprintWith(sortedKeys, rewritten, environment.hash),
    };
  };

  const refusalFor = (content: EditableContent): ProviderFailure | null => {
    const constraint = constraintViolatedBy(content);
    if (constraint === null) {
      return null;
    }
    if (defectIs(defect, "CONF-O29") && constraint === "invertedRange") {
      return null;
    }
    if (defectIs(defect, "CONF-O35") && constraint === "recurrenceDialect") {
      return null;
    }
    if (defectIs(defect, "CONF-O43") && constraint === "zoneIdentifier") {
      return null;
    }
    return { kind: "unrepresentable", constraint };
  };

  const objectFor = (
    uid: string,
    content: NormalizedContent<"reference">,
    revision: number,
  ): RemoteEvent => ({
    ...remoteRefFor(uid),
    uid: { kind: "eventUid", value: uid },
    calendar: referenceCalendar,
    revision,
    version: { kind: "remoteVersion", value: versionFor(uid, revision) },
    content: content.content,
    fingerprint: content.fingerprint,
    provenance: { kind: "ours", installation: environment.installation },
  });

  const replaceObject = (uid: string, next: RemoteEvent | null): void => {
    const remaining = store.objects().filter((event) => event.uid.value !== uid);
    if (next === null) {
      store.replaceObjects(remaining);
      return;
    }
    store.replaceObjects([...remaining, next]);
  };

  const disturbCanary = (): void => {
    if (!defectIs(defect, "CONF-O17")) {
      return;
    }
    const canary = markedIn("CONF-O17").at(0);
    if (!canary) {
      return;
    }
    replaceObject(canary.uid.value, { ...canary, revision: canary.revision + 1 });
  };

  const echoFor = (uid: string): EchoVerdict => {
    if (defectIs(defect, "CONF-O18") && isMarked(uid, "CONF-O18")) {
      return { kind: "notObserved" };
    }
    return { kind: "matched" };
  };

  const keyOrder = (): KeyOrder => {
    if (defectIs(defect, "CONF-O21")) {
      return insertionOrderKeys;
    }
    return sortedKeys;
  };

  const submittedEncoding = (content: EditableContent): string =>
    encodeIdentity(keyOrder(), !defectIs(defect, "CONF-O20"), content);

  const storedEncoding = (content: EditableContent): string =>
    encodeIdentity(keyOrder(), true, content);

  const createOutcome = (
    intent: Extract<WriteIntent<"reference">, { kind: "create" }>,
  ): Result<WriteOutcome> => {
    const refusal = refusalFor(intent.content.content);
    if (refusal !== null) {
      return { ok: false, failure: refusal };
    }
    const content = normalized(intent.content.content);
    const uid = intent.idempotencyKey.value;
    const existing = store.objects().find((event) => event.uid.value === uid);
    if (existing && storedEncoding(existing.content) === submittedEncoding(intent.content.content)) {
      if (!defectIs(defect, "CONF-O14") || !isMarked(uid, "CONF-O14")) {
        return {
          ok: true,
          value: { kind: "alreadyExists", remote: remoteRefFor(uid), version: existing.version },
        };
      }
      const duplicate = objectFor(`${uid}-duplicate`, content, 1);
      store.replaceObjects([...store.objects(), duplicate]);
      return {
        ok: true,
        value: {
          kind: "created",
          remote: remoteRefFor(duplicate.uid.value),
          version: duplicate.version,
          echo: echoFor(uid),
        },
      };
    }
    if (existing) {
      if (defectIs(defect, "CONF-O25")) {
        replaceObject(uid, null);
      }
      if (defectIs(defect, "CONF-O15")) {
        return {
          ok: true,
          value: { kind: "unchanged", remote: remoteRefFor(uid), version: existing.version },
        };
      }
      return {
        ok: true,
        value: {
          kind: "conflict",
          remote: remoteRefFor(uid),
          observed: { kind: "matchesVersion", version: existing.version },
        },
      };
    }
    const created = objectFor(uid, content, 1);
    store.replaceObjects([...store.objects(), created]);
    disturbCanary();
    return {
      ok: true,
      value: {
        kind: "created",
        remote: remoteRefFor(uid),
        version: created.version,
        echo: echoFor(uid),
      },
    };
  };

  const preconditionHolds = (
    existing: RemoteEvent,
    precondition: Extract<WriteIntent<"reference">, { kind: "update" }>["precondition"],
  ): boolean => {
    if (defectIs(defect, "CONF-O39")) {
      return true;
    }
    if (precondition.kind === "matchesVersion") {
      return precondition.version.value === existing.version.value;
    }
    return precondition.fingerprint.value === existing.fingerprint.value;
  };

  const updateOutcome = (
    intent: Extract<WriteIntent<"reference">, { kind: "update" }>,
  ): Result<WriteOutcome> => {
    const existing = store.objects().find((event) => event.id.value === intent.target.value);
    if (!existing) {
      return {
        ok: false,
        failure: { kind: "notFound", calendar: referenceCalendar, event: intent.target },
      };
    }
    if (!preconditionHolds(existing, intent.precondition)) {
      return staleConflict(existing);
    }
    const refusal = refusalFor(intent.content.content);
    if (refusal !== null) {
      return { ok: false, failure: refusal };
    }
    const next = objectFor(
      existing.uid.value,
      normalized(intent.content.content),
      existing.revision + 1,
    );
    replaceObject(existing.uid.value, next);
    disturbCanary();
    return {
      ok: true,
      value: {
        kind: "updated",
        remote: remoteRefFor(existing.uid.value),
        version: next.version,
        echo: echoFor(existing.uid.value),
      },
    };
  };

  const removalOutcome = (
    intent: Extract<WriteIntent<"reference">, { kind: "delete" } | { kind: "retire" }>,
  ): Result<WriteOutcome> => {
    const existing = store
      .objects()
      .find((event) => event.deleteHandle.value === intent.target.value);
    if (!existing) {
      return {
        ok: true,
        value: {
          kind: "alreadyAbsent",
          remote: { id: { kind: "remoteEventId", value: "absent" }, deleteHandle: intent.target },
        },
      };
    }
    if (!preconditionHolds(existing, intent.precondition)) {
      return staleConflict(existing);
    }
    replaceObject(existing.uid.value, null);
    return { ok: true, value: { kind: "deleted", remote: remoteRefFor(existing.uid.value) } };
  };

  const applyWrite = (intent: WriteIntent<"reference">): Result<WriteOutcome> => {
    switch (intent.kind) {
      case "create": {
        return createOutcome(intent);
      }
      case "update": {
        return updateOutcome(intent);
      }
      case "delete":
      case "retire": {
        return removalOutcome(intent);
      }
      default: {
        return assertNever(intent);
      }
    }
  };

  const logWrite = (intent: WriteIntent<"reference">, answered: Result<WriteOutcome>): void => {
    if (!answered.ok) {
      return;
    }
    const at = observedAt();
    if (defectIs(defect, "CONF-O36") && intent.kind === "update") {
      store.record({
        at,
        intent: {
          kind: "delete",
          calendar: intent.calendar,
          target: { kind: "deleteHandle", value: `handle-${intent.target.value}` },
          precondition: intent.precondition,
          reason: "sourceDeleted",
        },
        outcome: { kind: "deleted", remote: remoteRefFor(intent.target.value) },
      });
    }
    store.record({ at, intent, outcome: answered.value });
  };

  const attemptWrite = async (intent: WriteIntent<"reference">): Promise<Result<WriteOutcome>> => {
    try {
      return await environment.transport.run("write", () => {
        const answered = applyWrite(intent);
        logWrite(intent, answered);
        return Promise.resolve(answered);
      });
    } catch (error) {
      return { ok: false, failure: failureOfTransportError(error) };
    }
  };

  const write = (
    intent: WriteIntent<"reference">,
    context: OperationContext,
  ): Promise<Result<WriteOutcome>> =>
    raceDeadline(context, deadlineAnswers(), () => attemptWrite(intent));

  const enumerateCalendars = (account: AccountId): CalendarEnumeration => ({
    kind: "snapshot",
    account,
    calendars: [
      {
        key: referenceCalendar,
        displayName: "Reference calendar",
        timeZone: { kind: "zoneId", value: "UTC" },
        access: "readWrite",
      },
    ],
  });

  const listCalendars = (
    account: AccountId,
    context: OperationContext,
  ): Promise<Result<CalendarEnumeration>> =>
    raceDeadline(context, deadlineAnswers(), async () => {
      try {
        return await environment.transport.run("listCalendars", () =>
          Promise.resolve({ ok: true, value: enumerateCalendars(account) }),
        );
      } catch (error) {
        return { ok: false, failure: failureOfTransportError(error) };
      }
    });

  const armAbandonedTimer = (): void => {
    if (!defectIs(defect, "CONF-L8")) {
      return;
    }
    environment.clock.sleep(conformanceLimits.deadlineMs, lifetime.signal).catch(() => null);
  };

  const listChangesWithDefect = (
    request: ListChangesRequest,
    context: OperationContext,
  ): Promise<Result<ChangeListing>> => {
    armAbandonedTimer();
    return listChanges(request, context);
  };

  const obligationHolds = (): Promise<void> => {
    if (environment.clock.pendingTimers() > 0) {
      throw new Error("the reference provider left a timer armed");
    }
    return Promise.resolve();
  };

  return {
    contract: {
      provider: {
        capabilities: referenceCapabilities,
        listCalendars,
        listChanges: listChangesWithDefect,
        normalize: (content: EditableContent) => {
          const refusal = refusalFor(content);
          if (refusal !== null) {
            return { ok: false, failure: refusal };
          }
          return { ok: true, value: normalized(content) };
        },
        write,
      },
      fingerprint: referenceFingerprintContract,
      conformance: {
        leaseReleasedOnThrow: obligationHolds,
        followerRejectsWhenLeaderFails: obligationHolds,
        deadlineOnNeverResolvingStub: obligationHolds,
        abortMidFlightCleansUp: obligationHolds,
        retryCeilingProven: obligationHolds,
        concurrentSameKeyDoesNotDeadlock: obligationHolds,
        deletionInputsShareOneCalendar: obligationHolds,
      },
    },
    seed: (seed: ProviderSeed) => {
      store.seed(seed);
      return Promise.resolve();
    },
    inspect: () =>
      Promise.resolve({ objects: store.objects(), writeLog: store.writeLog() }),
    dispose: () => {
      lifetime.abort();
      return Promise.resolve();
    },
  };
};

export { createReference, remoteRefFor, versionFor };
export type { ReferenceOptions };
