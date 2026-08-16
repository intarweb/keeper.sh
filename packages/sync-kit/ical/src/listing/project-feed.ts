import type {
  CalendarKey,
  ChangeListing,
  CoverageWindow,
  EditableContent,
  Fingerprint,
  Instant,
  ListingScope,
  RemoteEvent,
  Result,
  WithheldEvent,
  WithheldIdentity,
  WithholdReason,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { canonicalEventFingerprint } from "../canonical/hash";
import { feedContentHash } from "../canonical/feed-hash";
import { canonicalOf } from "../canonical/project";
import type { IcsOptions } from "../options";
import { applyCancellations } from "../parse/cancellation";
import { toListingDiagnostics } from "../parse/diagnostics";
import { eventIdentityKey } from "../parse/identity";
import type { EventIdentity } from "../parse/identity";
import { parseIcsDocument } from "../parse/parse-calendar";
import { parseVevent } from "../parse/parse-vevent";
import type { ParsedVevent, VeventOutcome } from "../parse/parse-vevent";
import { icsUtcOf } from "../parse/date-value";
import { compareEventRevisions } from "../parse/revision-order";
import { identityOfOutcome } from "./presence";

const feedFreshnesses = ["changed", "unchanged"] as const;
type FeedFreshness = (typeof feedFreshnesses)[number];

interface UnsupportedEvent {
  readonly identity: WithheldIdentity;
  readonly reason: WithholdReason;
}

interface IcsFeedRequest {
  readonly body: string;
  readonly scope: ListingScope;
  readonly previousContentHash: Fingerprint | null;
  readonly options: IcsOptions;
}

interface IcsFeedProjection {
  readonly listing: Extract<ChangeListing, { kind: "snapshot" }>;
  readonly contentHash: Fingerprint;
  readonly freshness: FeedFreshness;
  readonly present: readonly EventIdentity[];
  readonly usable: readonly EventIdentity[];
  readonly unsupported: readonly UnsupportedEvent[];
}

interface ResolvedGroup {
  readonly present: readonly EventIdentity[];
  readonly outcomes: readonly VeventOutcome[];
  readonly usable: readonly ParsedVevent[];
}

const coverageForWholeFeed = (calendar: CalendarKey): CoverageWindow => ({
  covered: {
    start: { kind: "instant", value: "1800-01-01T00:00:00.000Z" },
    end: { kind: "instant", value: "2400-01-01T00:00:00.000Z" },
  },
  calendar,
});

const groupKeyOf = (outcome: VeventOutcome, index: number): string => {
  switch (outcome.kind) {
    case "parsed": {
      return outcome.event.identity.uid.value;
    }
    case "selfAuthored": {
      return outcome.identity.uid.value;
    }
    case "withheld": {
      if (!outcome.identity.uid) {
      return `#unidentified-${index}`;
      }
      return outcome.identity.uid.value;
    }
    default: {
      return assertNever(outcome);
    }
  }
};

const groupedByUid = (outcomes: readonly VeventOutcome[]): readonly (readonly VeventOutcome[])[] => {
  const grouped = new Map<string, VeventOutcome[]>();
  for (const [index, outcome] of outcomes.entries()) {
    const key = groupKeyOf(outcome, index);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(outcome);
      continue;
    }
    grouped.set(key, [outcome]);
  }
  return [...grouped.values()];
};

const withCancelledDays = (event: ParsedVevent, cancellations: readonly Instant[]): ParsedVevent => {
  if (!event.content.recurrence || cancellations.length === 0) {
    return event;
  }
  const exceptions = [
    ...new Set([...event.content.recurrence.exceptions, ...cancellations.map((instant) => icsUtcOf(instant))]),
  ].toSorted();
  const content: EditableContent = {
    ...event.content,
    recurrence: { ...event.content.recurrence, exceptions },
  };
  return { ...event, content };
};

const supersedingReason = (reason: WithholdReason, hasBuildableSibling: boolean): WithholdReason => {
  if (hasBuildableSibling) {
    return "supersededRevisionUnbuildable";
  }
  return reason;
};

const selfAuthoredOf = (
  outcomes: readonly VeventOutcome[],
): readonly Extract<VeventOutcome, { kind: "selfAuthored" }>[] =>
  outcomes.flatMap((outcome) => {
    if (outcome.kind !== "selfAuthored") {
      return [];
    }
    return [outcome];
  });

const withheldGroup = (
  outcomes: readonly VeventOutcome[],
  withheld: readonly Extract<VeventOutcome, { kind: "withheld" }>[],
  hasBuildableSibling: boolean,
): ResolvedGroup => {
  const [first] = withheld;
  if (!first) {
    return { present: [], outcomes: [], usable: [] };
  }
  const reason = supersedingReason(first.reason, hasBuildableSibling);
  const effective: VeventOutcome = { kind: "withheld", identity: first.identity, reason };
  return {
    present: identityOfOutcome(effective),
    outcomes: [...selfAuthoredOf(outcomes), effective],
    usable: [],
  };
};

const parsedOf = (outcomes: readonly VeventOutcome[]): readonly ParsedVevent[] =>
  outcomes.flatMap((outcome) => {
    if (outcome.kind !== "parsed") {
      return [];
    }
    return [outcome.event];
  });

const withheldOf = (
  outcomes: readonly VeventOutcome[],
): readonly Extract<VeventOutcome, { kind: "withheld" }>[] =>
  outcomes.flatMap((outcome) => {
    if (outcome.kind !== "withheld") {
      return [];
    }
    return [outcome];
  });

const asOutcomes = (events: readonly ParsedVevent[]): readonly VeventOutcome[] =>
  events.map((event) => ({ kind: "parsed", event }));

const resolveGroup = (outcomes: readonly VeventOutcome[]): ResolvedGroup => {
  const selfAuthored = selfAuthoredOf(outcomes);
  const parsed = parsedOf(outcomes);
  const withheld = withheldOf(outcomes);
  if (withheld.length > 0) {
    return withheldGroup(outcomes, withheld, parsed.length > 0);
  }
  if (parsed.length === 0) {
    return {
      present: selfAuthored.flatMap((outcome) => identityOfOutcome(outcome)),
      outcomes: selfAuthored,
      usable: [],
    };
  }
  const revisions = parsed.filter((event) => event.identity.kind !== "override");
  const overrides = parsed.filter((event) => event.identity.kind === "override");
  const ordered = [...revisions].toSorted((left, right) => compareEventRevisions(left, right));
  const winner = ordered.at(-1);
  const present = [
    ...selfAuthored.flatMap((outcome) => identityOfOutcome(outcome)),
    ...parsed.map((event) => event.identity),
  ];
  if (!winner) {
    const resolution = applyCancellations(overrides);
    return {
      present,
      outcomes: [...selfAuthored, ...asOutcomes(resolution.surviving)],
      usable: resolution.surviving,
    };
  }
  const resolution = applyCancellations([winner, ...overrides]);
  const usable = resolution.surviving.map((event) => {
    if (event === winner) {
      return withCancelledDays(event, resolution.cancellations);
    }
    return event;
  });
  return { present, outcomes: [...selfAuthored, ...asOutcomes(usable)], usable };
};

const toRemoteEvent = (event: ParsedVevent, scope: ListingScope): RemoteEvent => {
  const key = eventIdentityKey(event.identity);
  const fingerprint = canonicalEventFingerprint(
    canonicalOf({ ...event, identity: { kind: "master", uid: event.identity.uid } }),
  );
  return {
    id: { kind: "remoteEventId", value: key },
    deleteHandle: { kind: "deleteHandle", value: key },
    uid: event.identity.uid,
    calendar: scope.calendar,
    revision: event.revision.sequence ?? 0,
    version: { kind: "remoteVersion", value: fingerprint.value },
    content: event.content,
    fingerprint,
    provenance: { kind: "foreign" },
  };
};

const unsupportedOf = (outcomes: readonly VeventOutcome[]): readonly UnsupportedEvent[] =>
  outcomes.flatMap((outcome) => {
    if (outcome.kind !== "withheld") {
      return [];
    }
    return [{ identity: outcome.identity, reason: outcome.reason }];
  });

const withheldEventsOf = (unsupported: readonly UnsupportedEvent[]): readonly WithheldEvent[] =>
  unsupported.map((entry) => ({ ...entry.identity, reason: entry.reason }));

const freshnessOf = (contentHash: Fingerprint, previous: Fingerprint | null): FeedFreshness => {
  if (previous && previous.value === contentHash.value) {
    return "unchanged";
  }
  return "changed";
};

const projectIcsFeed = (request: IcsFeedRequest): Result<IcsFeedProjection> => {
  const document = parseIcsDocument(request.body, request.options);
  if (document.kind === "unreadable") {
    return {
      ok: false,
      failure: { kind: "transport", status: null, disposition: "permanent" },
    };
  }
  const outcomes = document.components.map((component) =>
    parseVevent(component, document, request.options),
  );
  const groups = groupedByUid(outcomes).map((group) => resolveGroup(group));
  const effective = groups.flatMap((group) => [...group.outcomes]);
  const usable = groups.flatMap((group) => [...group.usable]);
  const unsupported = unsupportedOf(effective);
  const contentHash = feedContentHash(request.body);
  return {
    ok: true,
    value: {
      listing: {
        kind: "snapshot",
        scope: request.scope,
        coverage: coverageForWholeFeed(request.scope.calendar),
        events: usable.map((event) => toRemoteEvent(event, request.scope)),
        removals: [],
        withheld: withheldEventsOf(unsupported),
        cursor: null,
        diagnostics: toListingDiagnostics(effective, request.options.limits),
      },
      contentHash,
      freshness: freshnessOf(contentHash, request.previousContentHash),
      present: groups.flatMap((group) => [...group.present]),
      usable: usable.map((event) => event.identity),
      unsupported,
    },
  };
};

export { coverageForWholeFeed, feedFreshnesses, projectIcsFeed };
export type { FeedFreshness, IcsFeedProjection, IcsFeedRequest, UnsupportedEvent };
