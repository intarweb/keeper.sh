import type { EventMapping } from "../events/mappings";
import type {
  EventAvailability,
  MaterializedSyncableEvent,
  RemoteEvent,
} from "../types";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
  normalizeText,
} from "../events/content-hash";
import { resolveIsAllDayEvent } from "../events/all-day";
import {
  TWO_WAY_WRITE_BACK_DAILY_CAP,
  TWO_WAY_WRITE_BACK_DAILY_WINDOW_MS,
} from "@keeper.sh/constants";
import type { PendingUpdate } from "../sync-engine/types";
import {
  isInsideSourceAuthoritativeWindow,
  isSameSerializedSecond,
  matchRemoteEventsToMappings,
} from "./operations";
import type { ReconciliationScope } from "./operations";
import {
  assertWriteBackPayload,
  resolveWriteBackEligibleFields,
} from "./write-back-policy";
import type {
  WriteBackField,
  WriteBackPolicy,
  WriteBackUpdates,
} from "./write-back-policy";

const MINUTE_MS = 60_000;
const EMPTY_LINE_LENGTH = 0;
const TWO_WAY_DELETE_GRACE_MS = 10 * MINUTE_MS;
const TWO_WAY_DELETE_MIN_OBSERVATIONS = 2;
const TWO_WAY_DELETE_ABSOLUTE_FLOOR = 5;
const TWO_WAY_DELETE_RATIO = 0.2;
const TWO_WAY_EPOCH_QUARANTINE_LIMIT = 5;
const TWO_WAY_EPOCH_WINDOW_MS = 60 * MINUTE_MS;
const FIRST_OBSERVATION = 1;
const NO_OBSERVATIONS = 0;
const NO_EPOCHS = 0;

type ReadHealth = "ambiguous_empty" | "healthy" | "live_empty";

type WriteBackRejectionReason =
  | "availability_clamped"
  | "availability_not_writable"
  | "recurring_event"
  | "redacted_field"
  | "write_back_quarantined";

interface DestinationDrift {
  availability: boolean;
  content: boolean;
  time: boolean;
}

interface ObservedDestinationState {
  availability: EventAvailability | null;
  contentHash: string;
  description: string;
  endTime: Date;
  isAllDay: boolean;
  location: string;
  startTime: Date;
  summary: string;
}

interface ExpectedSourceFields {
  description?: string;
  endTime?: Date;
  isAllDay?: boolean;
  location?: string;
  startTime?: Date;
  summary?: string;
}

type InboundClassification =
  | {
    mappingId: string;
    mappingUpdate?: PendingUpdate;
    missingObservationCount: number;
    type: "none";
  }
  | {
    mappingId: string;
    mappingUpdate: PendingUpdate;
    observed: ObservedDestinationState;
    type: "adopt-baseline";
  }
  | {
    expectedSource: ExpectedSourceFields;
    expectedSyncEventHash: string | null;
    mappingId: string;
    observed: ObservedDestinationState;
    /*
     * Null leaves the recorded push hash alone so the outbound comparison stays armed:
     * the source is carrying a change on an axis this payload does not write, and only a
     * push can carry that axis to the copy.
     */
    projectedSyncEventHash: string | null;
    sourceEventUid: string;
    type: "write-back";
    updates: WriteBackUpdates;
  }
  | {
    mappingId: string;
    mappingUpdate?: PendingUpdate;
    resolution: "source-wins";
    type: "conflict";
  }
  | {
    mappingId: string;
    mappingUpdate?: PendingUpdate;
    observed?: ObservedDestinationState;
    reason: WriteBackRejectionReason;
    type: "rejected";
  }
  | {
    mappingId: string;
    mappingUpdate: PendingUpdate;
    missingFirstObservedAt: Date;
    missingObservationCount: number;
    type: "delete-candidate";
  }
  | {
    expectedSource: ExpectedSourceFields;
    expectedSyncEventHash: string | null;
    mappingId: string;
    sourceEventUid: string;
    type: "delete";
  };

interface InboundCounters {
  adoptWindowDivergence: number;
  ambiguousEmptyRead: number;
  blockedAvailability: number;
  blockedRedactedField: number;
  conflictSourceWins: number;
  deleteBreakerTripped: number;
}

interface DeleteConfirmationRequest {
  reason: "all_copies_missing" | "delete_breaker_tripped";
  sourceCalendarIds: string[];
}

interface InboundClassificationResult {
  classifications: InboundClassification[];
  counters: InboundCounters;
  deleteBreakerTripped: boolean;
  deleteConfirmation: DeleteConfirmationRequest | null;
  readHealth: ReadHealth;
  suppressedMappingIds: string[];
}

interface ClassifyInboundChangesInput {
  existingMappings: EventMapping[];
  localEvents: MaterializedSyncableEvent[];
  now: Date;
  remoteEvents: RemoteEvent[];
  remoteRawItemCount: number;
  scope: ReconciliationScope;
}

/*
 * The witness adopts and clears as one unit. A row carrying a hash without the field
 * values it was taken from predates the per-field witness, so it reads as unverified and
 * the next observation records it rather than acting on it.
 */
const isWitnessRecorded = (mapping: EventMapping): boolean =>
  typeof mapping.destinationContentHash === "string"
  && typeof mapping.destinationSummary === "string"
  && typeof mapping.destinationDescription === "string"
  && typeof mapping.destinationLocation === "string"
  && typeof mapping.destinationIsAllDay === "boolean"
  && mapping.destinationStartTime instanceof Date
  && mapping.destinationEndTime instanceof Date;

const getDestinationDrift = (
  mapping: EventMapping,
  remoteEvent: RemoteEvent,
): DestinationDrift => {
  const recordedContentHash = mapping.destinationContentHash;
  if (!isWitnessRecorded(mapping)) {
    return { availability: false, content: false, time: false };
  }

  const content = typeof remoteEvent.editableContentHash === "string"
    && remoteEvent.editableContentHash !== recordedContentHash;
  const availability = typeof mapping.destinationAvailability === "string"
    && typeof remoteEvent.editableAvailability === "string"
    && remoteEvent.editableAvailability !== mapping.destinationAvailability;
  const recordedStartTime = mapping.destinationStartTime;
  const recordedEndTime = mapping.destinationEndTime;
  const time = recordedStartTime instanceof Date
    && recordedEndTime instanceof Date
    && (!isSameSerializedSecond(remoteEvent.startTime, recordedStartTime)
      || !isSameSerializedSecond(remoteEvent.endTime, recordedEndTime));

  return { availability, content, time };
};

const resolveReadHealth = (
  remoteEventCount: number,
  rawItemCount: number,
  mappingCount: number,
): ReadHealth => {
  if (remoteEventCount > NO_OBSERVATIONS) {
    return "healthy";
  }
  if (rawItemCount > NO_OBSERVATIONS) {
    return "live_empty";
  }
  if (mappingCount > NO_OBSERVATIONS) {
    return "ambiguous_empty";
  }
  return "healthy";
};

const createCounters = (): InboundCounters => ({
  adoptWindowDivergence: 0,
  ambiguousEmptyRead: 0,
  blockedAvailability: 0,
  blockedRedactedField: 0,
  conflictSourceWins: 0,
  deleteBreakerTripped: 0,
});

const isRecurringMapping = (mapping: EventMapping): boolean =>
  mapping.syncEventId !== mapping.eventStateId
  || typeof mapping.recurrenceRule === "string"
  || mapping.recurrenceId instanceof Date;

/*
 * The window rolls, so a mapping that wrote back a few times an hour ago starts again from
 * zero. A mapping that reached the limit does not: a breach is sticky until a human clears
 * it, because otherwise a destination that varies on every read would be handed a fresh
 * budget every hour forever.
 */
const resolveEffectiveEpoch = (mapping: EventMapping, now: Date): number => {
  const epoch = mapping.writeBackEpoch ?? NO_EPOCHS;
  if (epoch >= TWO_WAY_EPOCH_QUARANTINE_LIMIT) {
    return epoch;
  }
  const windowStart = mapping.writeBackEpochWindowStart;
  if (windowStart instanceof Date && now.getTime() - windowStart.getTime() >= TWO_WAY_EPOCH_WINDOW_MS) {
    return NO_EPOCHS;
  }
  return epoch;
};

const resolveEffectiveDailyCount = (mapping: EventMapping, now: Date): number => {
  const dailyCount = mapping.writeBackDailyCount ?? NO_EPOCHS;
  if (dailyCount >= TWO_WAY_WRITE_BACK_DAILY_CAP) {
    return dailyCount;
  }
  const windowStart = mapping.writeBackDailyWindowStart;
  if (
    windowStart instanceof Date
    && now.getTime() - windowStart.getTime() >= TWO_WAY_WRITE_BACK_DAILY_WINDOW_MS
  ) {
    return NO_EPOCHS;
  }
  return dailyCount;
};

const isBudgetSpent = (mapping: EventMapping, now: Date): boolean =>
  resolveEffectiveEpoch(mapping, now) >= TWO_WAY_EPOCH_QUARANTINE_LIMIT
  || resolveEffectiveDailyCount(mapping, now) >= TWO_WAY_WRITE_BACK_DAILY_CAP;

const createWitnessUpdate = (
  mappingId: string,
  observed: ObservedDestinationState,
): PendingUpdate => ({
  destinationAvailability: observed.availability,
  destinationContentHash: observed.contentHash,
  destinationDescription: observed.description,
  destinationEndTime: observed.endTime,
  destinationIsAllDay: observed.isAllDay,
  destinationLocation: observed.location,
  destinationStartTime: observed.startTime,
  destinationSummary: observed.summary,
  id: mappingId,
  missingFirstObservedAt: null,
  missingObservationCount: NO_OBSERVATIONS,
});

const hasPendingDeleteState = (mapping: EventMapping): boolean =>
  (mapping.missingObservationCount ?? NO_OBSERVATIONS) > NO_OBSERVATIONS
  || mapping.missingFirstObservedAt instanceof Date;

const resolveAvailabilityRejection = (
  localEvent: MaterializedSyncableEvent,
  remoteEvent: RemoteEvent,
): WriteBackRejectionReason => {
  const localAvailability = localEvent.availability ?? "busy";
  const supported = remoteEvent.supportedAvailabilities ?? [];
  if (supported.includes(localAvailability)) {
    return "availability_not_writable";
  }
  return "availability_clamped";
};

interface ContentUpdates {
  allDayChanged: boolean;
  observedIsAllDay: boolean;
  rejected: boolean;
  text: WriteBackUpdates;
}

const resolveLocalIsAllDay = (localEvent: MaterializedSyncableEvent): boolean =>
  resolveIsAllDayEvent({
    endTime: localEvent.endTime,
    isAllDay: localEvent.isAllDay,
    startTime: localEvent.startTime,
  });

/*
 * A destination that stores rich text and hands back a plain-text rendering of it pads
 * line ends and inserts blank lines. Attribution absorbs that rendering: the cost is
 * that a whitespace-only edit is not written back, and the gain is that the
 * destination's own re-encoding never overwrites the real value on the source.
 */
const normalizeRenderedText = (value: string): string =>
  value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > EMPTY_LINE_LENGTH)
    .join("\n");

const hasFieldMoved = (observed: string, recorded: string | null | undefined): boolean =>
  normalizeRenderedText(observed) !== normalizeRenderedText(recorded ?? "");

const collectContentUpdates = (
  mapping: EventMapping,
  observed: ObservedDestinationState,
  eligibleFields: ReadonlySet<WriteBackField>,
): ContentUpdates => {
  const recorded: [WriteBackField, string, string | null | undefined][] = [
    ["summary", observed.summary, mapping.destinationSummary],
    ["description", observed.description, mapping.destinationDescription],
    ["location", observed.location, mapping.destinationLocation],
  ];

  const textChanges = recorded
    .filter(([, value, baseline]) => hasFieldMoved(value, baseline))
    .map(([field, value]): [WriteBackField, string] => [field, value]);
  const writable = textChanges.filter(([field]) => eligibleFields.has(field));

  return {
    allDayChanged: observed.isAllDay !== mapping.destinationIsAllDay,
    observedIsAllDay: observed.isAllDay,
    rejected: writable.length !== textChanges.length,
    text: Object.fromEntries(writable),
  };
};

const collectExpectedSource = (
  localEvent: MaterializedSyncableEvent,
  updates: WriteBackUpdates,
): ExpectedSourceFields => ({
  ...("summary" in updates && { summary: localEvent.summary }),
  ...("description" in updates && { description: localEvent.description ?? "" }),
  ...("location" in updates && { location: localEvent.location ?? "" }),
  ...("startTime" in updates && { startTime: localEvent.startTime }),
  ...("endTime" in updates && { endTime: localEvent.endTime }),
  ...("isAllDay" in updates && { isAllDay: resolveLocalIsAllDay(localEvent) }),
});

const collectExpectedSourceForDelete = (
  localEvent: MaterializedSyncableEvent,
): ExpectedSourceFields => ({
  endTime: localEvent.endTime,
  isAllDay: resolveLocalIsAllDay(localEvent),
  startTime: localEvent.startTime,
});

interface PendingDelete {
  deleteApproved: boolean;
  localEvent: MaterializedSyncableEvent;
  mapping: EventMapping;
  missingFirstObservedAt: Date;
  missingObservationCount: number;
}

const createDeleteCandidate = (pending: PendingDelete): InboundClassification => ({
  mappingId: pending.mapping.id,
  mappingUpdate: {
    id: pending.mapping.id,
    missingFirstObservedAt: pending.missingFirstObservedAt,
    missingObservationCount: pending.missingObservationCount,
  },
  missingFirstObservedAt: pending.missingFirstObservedAt,
  missingObservationCount: pending.missingObservationCount,
  type: "delete-candidate",
});

interface MappingOutcome {
  classification?: InboundClassification;
  pendingDelete?: PendingDelete;
  suppress: boolean;
}

interface MappingContext {
  counters: InboundCounters;
  localEvent: MaterializedSyncableEvent;
  mapping: EventMapping;
  now: Date;
  policy: WriteBackPolicy;
  scope: ReconciliationScope;
}

const resolveEligibleMappings = (
  existingMappings: EventMapping[],
  policies: ReadonlyMap<string, WriteBackPolicy>,
  scope: ReconciliationScope,
): { mapping: EventMapping; policy: WriteBackPolicy }[] => {
  const eligible: { mapping: EventMapping; policy: WriteBackPolicy }[] = [];
  for (const mapping of existingMappings) {
    const { sourceCalendarId } = mapping;
    if (!sourceCalendarId) {
      continue;
    }
    const policy = policies.get(sourceCalendarId);
    if (!policy || policy.writeBackMode === "off") {
      continue;
    }
    if (!isInsideSourceAuthoritativeWindow(mapping, sourceCalendarId, scope)) {
      continue;
    }
    eligible.push({ mapping, policy });
  }
  return eligible;
};

const createBreakerConfirmation = (
  deleteBreakerTripped: boolean,
  pendingDeletes: PendingDelete[],
): DeleteConfirmationRequest | null => {
  if (!deleteBreakerTripped) {
    return null;
  }
  return {
    reason: "delete_breaker_tripped",
    sourceCalendarIds: [...new Set(
      pendingDeletes.flatMap(({ mapping }) => mapping.sourceCalendarId ?? []),
    )],
  };
};

const hasApprovedDeletion = (
  eligible: { mapping: EventMapping; policy: WriteBackPolicy }[],
): boolean => eligible.some(({ policy }) =>
  policy.deleteApproved && policy.writeBackMode === "edits_and_deletes");

const collectDeletingSourceCalendarIds = (
  eligible: { mapping: EventMapping; policy: WriteBackPolicy }[],
): string[] => [...new Set(
  eligible
    .filter(({ policy }) => policy.writeBackMode === "edits_and_deletes")
    .flatMap(({ mapping }) => mapping.sourceCalendarId ?? []),
)];

const isDeletionRefused = (context: MappingContext): boolean => {
  const { mapping, policy, scope } = context;
  if (policy.writeBackMode !== "edits_and_deletes" || !scope.authoritativeWindow) {
    return true;
  }
  return mapping.eventStateId !== null
    && Boolean(scope.withheldSourceEventStateIds?.has(mapping.eventStateId));
};

const clearPendingDeleteUpdate = (mapping: EventMapping): PendingUpdate => ({
  id: mapping.id,
  missingFirstObservedAt: null,
  missingObservationCount: NO_OBSERVATIONS,
});

const classifyMissingMirror = (context: MappingContext): MappingOutcome => {
  const { counters, localEvent, mapping, now } = context;
  if (isRecurringMapping(mapping)) {
    /*
     * Refusing the deletion must hand the mapping back to the ordinary re-create path.
     * Suppressing it as well would leave the mirror neither deleted nor restored, which is
     * a divergence the user can never resolve.
     */
    return {
      classification: {
        mappingId: mapping.id,
        reason: "recurring_event",
        type: "rejected",
        ...(hasPendingDeleteState(mapping) && {
          mappingUpdate: clearPendingDeleteUpdate(mapping),
        }),
      },
      suppress: false,
    };
  }
  if (isDeletionRefused(context)) {
    return { suppress: false };
  }
  if (mapping.syncEventHash !== createSyncEventContentHash(localEvent)) {
    counters.conflictSourceWins += FIRST_OBSERVATION;
    return {
      classification: {
        mappingId: mapping.id,
        resolution: "source-wins",
        type: "conflict",
        ...(hasPendingDeleteState(mapping) && {
          mappingUpdate: clearPendingDeleteUpdate(mapping),
        }),
      },
      suppress: false,
    };
  }

  const missingObservationCount = (mapping.missingObservationCount ?? NO_OBSERVATIONS)
    + FIRST_OBSERVATION;
  const missingFirstObservedAt = mapping.missingFirstObservedAt ?? now;
  const graceElapsed = now.getTime() - missingFirstObservedAt.getTime()
    >= TWO_WAY_DELETE_GRACE_MS;
  const pending: PendingDelete = {
    deleteApproved: context.policy.deleteApproved,
    localEvent,
    mapping,
    missingFirstObservedAt,
    missingObservationCount,
  };

  if (missingObservationCount >= TWO_WAY_DELETE_MIN_OBSERVATIONS && graceElapsed) {
    return { pendingDelete: pending, suppress: true };
  }
  return { classification: createDeleteCandidate(pending), suppress: true };
};

const createQuiescentOutcome = (
  mapping: EventMapping,
  outbound: boolean,
): MappingOutcome => ({
  classification: {
    mappingId: mapping.id,
    missingObservationCount: NO_OBSERVATIONS,
    type: "none",
    ...(hasPendingDeleteState(mapping) && {
      mappingUpdate: {
        id: mapping.id,
        missingFirstObservedAt: null,
        missingObservationCount: NO_OBSERVATIONS,
      },
    }),
  },
  /*
   * The ordinary stale check compares the mirror against what we would push now, so a
   * destination that normalizes on write reads as permanently stale there. The witness
   * has already settled that question, so only a source-side change may still push.
   */
  suppress: !outbound,
});

const createRejection = (
  mapping: EventMapping,
  observed: ObservedDestinationState,
  reason: WriteBackRejectionReason,
  outbound: boolean,
): MappingOutcome => ({
  classification: {
    mappingId: mapping.id,
    mappingUpdate: createWitnessUpdate(mapping.id, observed),
    observed,
    reason,
    type: "rejected",
  },
  suppress: !outbound,
});

interface DriftResolution {
  conflicted: boolean;
  rejectionReason: WriteBackRejectionReason | null;
  sourceNonTimeDrifted: boolean;
  sourceTimeDrifted: boolean;
  updates: WriteBackUpdates;
}

/*
 * A schedule write carries three fields, never one. Google and Outlook read the all-day
 * flag from the shape of the start and end they are handed, so sending a bare instant for
 * an event the source holds as all-day rewrites a real all-day event into a timed one.
 */
const NO_CONTENT_UPDATES: ContentUpdates = {
  allDayChanged: false,
  observedIsAllDay: false,
  rejected: false,
  text: {},
};

const resolveContentUpdates = (
  mapping: EventMapping,
  observed: ObservedDestinationState,
  drift: DestinationDrift,
  eligibleFields: ReadonlySet<WriteBackField>,
): ContentUpdates => {
  if (!drift.content) {
    return NO_CONTENT_UPDATES;
  }
  return collectContentUpdates(mapping, observed, eligibleFields);
};

const resolveScheduleAuthority = (
  localEvent: MaterializedSyncableEvent,
  observed: ObservedDestinationState,
  destinationTimeDrifted: boolean,
): { endTime: Date; startTime: Date } => {
  if (destinationTimeDrifted) {
    return { endTime: observed.endTime, startTime: observed.startTime };
  }
  return { endTime: localEvent.endTime, startTime: localEvent.startTime };
};

const resolveWrittenIsAllDay = (
  localEvent: MaterializedSyncableEvent,
  content: ContentUpdates,
): boolean => {
  if (content.allDayChanged) {
    return content.observedIsAllDay;
  }
  return resolveLocalIsAllDay(localEvent);
};

/*
 * No destination reports a timezone, so none is ever propagated. The source's own zone
 * travels beside the instants because a provider handed a bare instant re-homes the event
 * to its calendar default: a preservation, never a propagation.
 */
const resolveScheduleUpdates = (
  localEvent: MaterializedSyncableEvent,
  observed: ObservedDestinationState,
  content: ContentUpdates,
  destinationTimeDrifted: boolean,
): WriteBackUpdates => ({
  ...resolveScheduleAuthority(localEvent, observed, destinationTimeDrifted),
  isAllDay: resolveWrittenIsAllDay(localEvent, content),
  ...(localEvent.startTimeZone && { startTimeZone: localEvent.startTimeZone }),
});

const resolveDrift = (
  context: MappingContext,
  remoteEvent: RemoteEvent,
  observed: ObservedDestinationState,
  drift: DestinationDrift,
  eligibleFields: ReadonlySet<WriteBackField>,
): DriftResolution => {
  const { counters, localEvent, mapping } = context;
  const sourceTimeDrifted = !isSameSerializedSecond(localEvent.startTime, mapping.startTime)
    || !isSameSerializedSecond(localEvent.endTime, mapping.endTime);
  const sourceNonTimeDrifted = mapping.syncEventHash !== createSyncEventContentHash({
    ...localEvent,
    endTime: mapping.endTime,
    startTime: mapping.startTime,
  });
  const content = resolveContentUpdates(mapping, observed, drift, eligibleFields);

  let conflicted = false;
  let rejectionReason: WriteBackRejectionReason | null = null;
  let updates: WriteBackUpdates = {};

  if (content.rejected) {
    rejectionReason = "redacted_field";
    counters.blockedRedactedField += FIRST_OBSERVATION;
  }

  const wantsScheduleWrite = drift.time || content.allDayChanged;
  if (wantsScheduleWrite) {
    if (sourceTimeDrifted || (content.allDayChanged && sourceNonTimeDrifted)) {
      conflicted = true;
    } else {
      updates = resolveScheduleUpdates(localEvent, observed, content, drift.time);
    }
  }

  const hasWritableText = Object.keys(content.text).length > NO_OBSERVATIONS;
  if (hasWritableText) {
    if (sourceNonTimeDrifted) {
      conflicted = true;
    } else {
      updates = { ...updates, ...content.text };
    }
  }

  /*
   * No payload ever carries availability, so an availability edit is always swallowed and
   * the count is what makes it visible. It is taken before the reason is weighed, because
   * a payload from another axis discards the reason but not the discarded edit.
   */
  if (drift.availability) {
    counters.blockedAvailability += FIRST_OBSERVATION;
    rejectionReason = resolveAvailabilityRejection(localEvent, remoteEvent);
  }

  return { conflicted, rejectionReason, sourceNonTimeDrifted, sourceTimeDrifted, updates };
};

/*
 * The recorded push hash must describe the state the copy actually holds, never the state
 * of the source. A payload that writes one axis while the source is carrying an unpushed
 * change on another would otherwise mark that change as already delivered, leaving the
 * copy stably wrong with nothing left to notice it.
 */
const resolveProjectedSyncEventHash = (
  localEvent: MaterializedSyncableEvent,
  mapping: EventMapping,
  resolution: DriftResolution,
): string | null => {
  if ("startTime" in resolution.updates) {
    if (resolution.sourceNonTimeDrifted) {
      return null;
    }
    return createSyncEventContentHash({ ...localEvent, ...resolution.updates });
  }
  if (resolution.sourceTimeDrifted) {
    return createSyncEventContentHash({
      ...localEvent,
      endTime: mapping.endTime,
      startTime: mapping.startTime,
      ...resolution.updates,
    });
  }
  return createSyncEventContentHash({ ...localEvent, ...resolution.updates });
};

const classifyPresentMirror = (
  context: MappingContext,
  remoteEvent: RemoteEvent,
  observed: ObservedDestinationState,
): MappingOutcome => {
  const { counters, localEvent, mapping, now, policy } = context;
  const drift = getDestinationDrift(mapping, remoteEvent);
  const outbound = mapping.syncEventHash !== createSyncEventContentHash(localEvent);

  if (!isWitnessRecorded(mapping)) {
    if (outbound) {
      return { suppress: false };
    }
    /*
     * An edit made between a push and the first read of the copy is byte-identical to a
     * provider normalizing that push, so it is adopted rather than written back. The
     * divergence is counted so the swallowed edit is visible rather than silent.
     */
    if (observed.contentHash !== createEditableEventContentHash(localEvent)) {
      counters.adoptWindowDivergence += FIRST_OBSERVATION;
    }
    return {
      classification: {
        mappingId: mapping.id,
        mappingUpdate: createWitnessUpdate(mapping.id, observed),
        observed,
        type: "adopt-baseline",
      },
      suppress: true,
    };
  }

  if (!drift.availability && !drift.content && !drift.time) {
    return createQuiescentOutcome(mapping, outbound);
  }

  if (isRecurringMapping(mapping)) {
    return createRejection(mapping, observed, "recurring_event", outbound);
  }

  if (isBudgetSpent(mapping, now)) {
    return createRejection(mapping, observed, "write_back_quarantined", outbound);
  }

  const eligibleFields = resolveWriteBackEligibleFields(policy);
  const resolution = resolveDrift(context, remoteEvent, observed, drift, eligibleFields);

  if (resolution.conflicted) {
    counters.conflictSourceWins += FIRST_OBSERVATION;
    return {
      classification: { mappingId: mapping.id, resolution: "source-wins", type: "conflict" },
      suppress: false,
    };
  }

  if (Object.keys(resolution.updates).length > NO_OBSERVATIONS) {
    assertWriteBackPayload(resolution.updates, eligibleFields);
    return {
      classification: {
        expectedSource: collectExpectedSource(localEvent, resolution.updates),
        expectedSyncEventHash: mapping.syncEventHash,
        mappingId: mapping.id,
        observed,
        projectedSyncEventHash: resolveProjectedSyncEventHash(
          localEvent,
          mapping,
          resolution,
        ),
        sourceEventUid: localEvent.sourceEventUid,
        type: "write-back",
        updates: resolution.updates,
      },
      suppress: true,
    };
  }

  if (resolution.rejectionReason) {
    return createRejection(mapping, observed, resolution.rejectionReason, outbound);
  }

  /*
   * The axis moved but no field moved against its own recorded value, so the drift was
   * the destination re-encoding what we wrote. Record what it reported now and act on
   * nothing, or the same re-encoding is re-read as an edit on every pass.
   */
  return {
    classification: {
      mappingId: mapping.id,
      mappingUpdate: createWitnessUpdate(mapping.id, observed),
      observed,
      type: "adopt-baseline",
    },
    suppress: !outbound,
  };
};

const readObservedState = (
  remoteEvent: RemoteEvent,
): ObservedDestinationState | null => {
  const contentHash = remoteEvent.editableContentHash;
  const fields = remoteEvent.editableFields;
  if (typeof contentHash !== "string" || !fields) {
    return null;
  }
  return {
    availability: remoteEvent.editableAvailability ?? null,
    contentHash,
    description: normalizeText(fields.description),
    endTime: remoteEvent.endTime,
    isAllDay: resolveIsAllDayEvent({
      endTime: remoteEvent.endTime,
      isAllDay: fields.isAllDay,
      startTime: remoteEvent.startTime,
    }),
    location: normalizeText(fields.location),
    startTime: remoteEvent.startTime,
    summary: normalizeText(fields.summary),
  };
};

const classifyMapping = (
  context: MappingContext,
  remoteEvent?: RemoteEvent,
): MappingOutcome => {
  if (!remoteEvent) {
    return classifyMissingMirror(context);
  }
  const observed = readObservedState(remoteEvent);
  if (!observed) {
    return { suppress: false };
  }
  return classifyPresentMirror(context, remoteEvent, observed);
};

const classifyInboundChanges = (
  input: ClassifyInboundChangesInput,
): InboundClassificationResult => {
  const { existingMappings, localEvents, now, remoteEvents, remoteRawItemCount, scope } = input;
  const counters = createCounters();
  const classifications: InboundClassification[] = [];
  const suppressedMappingIds: string[] = [];
  const readHealth = resolveReadHealth(
    remoteEvents.length,
    remoteRawItemCount,
    existingMappings.length,
  );
  const policies = scope.writeBackPolicies ?? new Map<string, WriteBackPolicy>();
  const eligible = resolveEligibleMappings(existingMappings, policies, scope);

  if (eligible.length === NO_OBSERVATIONS) {
    return {
      classifications,
      counters,
      deleteBreakerTripped: false,
      deleteConfirmation: null,
      readHealth,
      suppressedMappingIds,
    };
  }

  /*
   * A read that returned literally nothing cannot tell an emptied calendar from a broken
   * connection, so it holds for an answer. Once that answer is in, the pass proceeds: each
   * deletion is still confirmed against the copy itself before anything on the source is
   * touched, which is the check that distinguishes the two cases.
   */
  if (readHealth === "ambiguous_empty" && !hasApprovedDeletion(eligible)) {
    counters.ambiguousEmptyRead = FIRST_OBSERVATION;
    return {
      classifications,
      counters,
      deleteBreakerTripped: false,
      deleteConfirmation: {
        reason: "all_copies_missing",
        sourceCalendarIds: collectDeletingSourceCalendarIds(eligible),
      },
      readHealth,
      suppressedMappingIds: eligible.map(({ mapping }) => mapping.id),
    };
  }

  const localEventsById = new Map(
    localEvents
      .filter((event) => isInsideSourceAuthoritativeWindow(event, event.calendarId, scope))
      .map((event) => [event.id, event]),
  );
  const remoteEventsByMappingId = matchRemoteEventsToMappings(
    eligible.map(({ mapping }) => mapping),
    remoteEvents,
  );
  const pendingDeletes: PendingDelete[] = [];

  for (const { mapping, policy } of eligible) {
    const localEvent = localEventsById.get(mapping.syncEventId);
    if (!localEvent) {
      continue;
    }
    /*
     * The pair is waiting on a human answer about copies that vanished. Acting on any of
     * them would pre-empt the answer, and letting the missing ones be re-created would
     * reset the very pending state the answer applies to.
     */
    if (policy.paused) {
      if (!remoteEventsByMappingId.has(mapping.id)) {
        suppressedMappingIds.push(mapping.id);
      }
      continue;
    }
    const outcome = classifyMapping(
      { counters, localEvent, mapping, now, policy, scope },
      remoteEventsByMappingId.get(mapping.id),
    );
    if (outcome.classification) {
      classifications.push(outcome.classification);
    }
    if (outcome.pendingDelete) {
      pendingDeletes.push(outcome.pendingDelete);
    }
    if (outcome.suppress) {
      suppressedMappingIds.push(mapping.id);
    }
  }

  /*
   * A deletion a human has already answered for is not a candidate the breaker is
   * protecting against: leaving it in the count would re-trip on the very answer that was
   * given, and the pair could never finish the bulk deletion it was asked about.
   */
  const unapprovedDeletes = pendingDeletes.filter(({ deleteApproved }) => !deleteApproved);
  const deleteBreakerTripped = unapprovedDeletes.length > TWO_WAY_DELETE_ABSOLUTE_FLOOR
    && unapprovedDeletes.length / eligible.length > TWO_WAY_DELETE_RATIO;

  if (deleteBreakerTripped) {
    counters.deleteBreakerTripped = FIRST_OBSERVATION;
  }

  for (const pending of pendingDeletes) {
    if (deleteBreakerTripped && !pending.deleteApproved) {
      classifications.push(createDeleteCandidate(pending));
      continue;
    }
    classifications.push({
      expectedSource: collectExpectedSourceForDelete(pending.localEvent),
      expectedSyncEventHash: pending.mapping.syncEventHash,
      mappingId: pending.mapping.id,
      sourceEventUid: pending.localEvent.sourceEventUid,
      type: "delete",
    });
  }

  return {
    classifications,
    counters,
    deleteBreakerTripped,
    deleteConfirmation: createBreakerConfirmation(deleteBreakerTripped, unapprovedDeletes),
    readHealth,
    suppressedMappingIds,
  };
};

export {
  assertWriteBackPayload,
  classifyInboundChanges,
  getDestinationDrift,
  resolveWriteBackEligibleFields,
  TWO_WAY_DELETE_ABSOLUTE_FLOOR,
  TWO_WAY_DELETE_GRACE_MS,
  TWO_WAY_DELETE_MIN_OBSERVATIONS,
  TWO_WAY_DELETE_RATIO,
  TWO_WAY_EPOCH_QUARANTINE_LIMIT,
  TWO_WAY_EPOCH_WINDOW_MS,
};
export type {
  DeleteConfirmationRequest,
  DestinationDrift,
  ExpectedSourceFields,
  InboundClassification,
  InboundClassificationResult,
  InboundCounters,
  ObservedDestinationState,
  ReadHealth,
  WriteBackRejectionReason,
};
