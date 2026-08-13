import type { EventMapping } from "../events/mappings";
import type {
  MaterializedSyncableEvent,
  RemoteEvent,
  SyncOperation,
} from "../types";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
  EDITABLE_CONTENT_ECHO_ALGORITHM,
} from "../events/content-hash";
import {
  echoAccountsForAvailability,
  echoAccountsForContent,
  echoAccountsForTime,
  parseRemoteStateEcho,
  readRemoteStateObservation,
  serializeRemoteStateEcho,
} from "../events/remote-echo";
import type { RemoteStateEcho, RemoteStateObservation } from "../events/remote-echo";
import { overlapsTimeWindow } from "../events/time-range";
import type { SyncWindow } from "./sync-range";

interface ReconciliationScope {
  authoritativeWindow: SyncWindow | null;
  authoritativeSourceWindows?: ReadonlyMap<string, SyncWindow>;
  configuredSourceCalendarIds?: ReadonlySet<string>;
  requestedWindow: SyncWindow;
  withheldSourceEventStateIds?: ReadonlySet<string>;
}

type EchoComparisonMode = "off" | "shadow" | "on";

interface EchoReconciliationOptions {
  maxAdoptionsPerRun: number;
  mode: EchoComparisonMode;
}

interface EchoAdoption {
  contentHash: string;
  mappingId: string;
}

interface EchoCounts {
  adoptedCount: number;
  adoptionLocalDivergenceCount: number;
  avoidedContentChangedCount: number;
  contentChangedCount: number;
  eligibleCount: number;
  legacyContentChangedCount: number;
  missingCount: number;
  unconfirmedCount: number;
}

interface StaleMappingResult {
  adoptionIntents: EchoAdoption[];
  echoCounts: EchoCounts;
  rejectedContentHashes: Map<string, string>;
  retiredRejectedEchoes: Map<string, string>;
  staleReasonCounts: StaleReasonCounts;
  staleMappingIds: string[];
  staleMappedEventIds: Set<string>;
  staleRemoteMappings: EventMapping[];
}

interface ComputeSyncOperationsResult {
  adoptionIntents: EchoAdoption[];
  echoCounts: EchoCounts;
  mappingUpdates: MappingUpdate[];
  operations: SyncOperation[];
  staleReasonCounts: StaleReasonCounts;
  staleMappingIds: string[];
}

interface StaleReasonCounts {
  localHashChanged: number;
  occurrenceReassigned: number;
  remoteAvailabilityChanged: number;
  remoteContentChanged: number;
  remoteMissing: number;
  remoteTimeChanged: number;
}

interface RemoteStateChanges {
  availability: boolean;
  content: boolean;
  time: boolean;
}

interface MappingUpdate {
  deleteIdentifier: string;
  id: string;
  remoteEcho?: { contentHash: string };
  syncEventHash: string;
  syncEventId: string;
}

interface OccurrenceReassignment {
  event: MaterializedSyncableEvent;
  mapping: EventMapping;
}

const DEFAULT_ECHO_ADOPTION_MAX_PER_RUN = 2000;

const createDisabledEchoOptions = (): EchoReconciliationOptions => ({
  maxAdoptionsPerRun: DEFAULT_ECHO_ADOPTION_MAX_PER_RUN,
  mode: "off",
});

const createEchoCounts = (): EchoCounts => ({
  adoptedCount: 0,
  adoptionLocalDivergenceCount: 0,
  avoidedContentChangedCount: 0,
  contentChangedCount: 0,
  eligibleCount: 0,
  legacyContentChangedCount: 0,
  missingCount: 0,
  unconfirmedCount: 0,
});

/*
 * "unconfirmed" is an echo the destination claimed in a write response but that no
 * read-back has reproduced yet, so it is a prediction rather than an observation.
 */
type EchoState = "absent" | "confirmed" | "unconfirmed";

const readRecordedEcho = (mapping: EventMapping): string | null => {
  if (mapping.remoteEchoAlgorithm !== EDITABLE_CONTENT_ECHO_ALGORITHM) {
    return null;
  }
  return mapping.remoteContentHash;
};

const readRejectedEcho = (mapping: EventMapping): string | null => {
  if (mapping.remoteEchoAlgorithm !== EDITABLE_CONTENT_ECHO_ALGORITHM) {
    return null;
  }
  return mapping.remoteRejectedContentHash;
};

const resolveEchoState = (mapping: EventMapping): EchoState => {
  if (readRecordedEcho(mapping) === null) {
    return "absent";
  }
  if (mapping.remoteEchoAt === null) {
    return "unconfirmed";
  }
  return "confirmed";
};

const createStaleReasonCounts = (): StaleReasonCounts => ({
  localHashChanged: 0,
  occurrenceReassigned: 0,
  remoteAvailabilityChanged: 0,
  remoteContentChanged: 0,
  remoteMissing: 0,
  remoteTimeChanged: 0,
});

const getMappingSyncEventId = (mapping: EventMapping): string => mapping.syncEventId;

const getSourceAuthoritativeWindow = (
  scope: ReconciliationScope,
  sourceCalendarId: string | null,
): SyncWindow | null => {
  if (sourceCalendarId === null) {
    return scope.requestedWindow;
  }
  if (!scope.authoritativeSourceWindows || !scope.configuredSourceCalendarIds) {
    return scope.authoritativeWindow;
  }
  if (!scope.configuredSourceCalendarIds.has(sourceCalendarId)) {
    return scope.requestedWindow;
  }
  return scope.authoritativeSourceWindows.get(sourceCalendarId) ?? null;
};

const isInsideSourceAuthoritativeWindow = (
  value: Pick<EventMapping, "startTime" | "endTime">,
  sourceCalendarId: string | null,
  scope: ReconciliationScope,
): boolean => {
  const sourceWindow = getSourceAuthoritativeWindow(scope, sourceCalendarId);
  return sourceWindow !== null && overlapsTimeWindow(
    value,
    sourceWindow.timeMin,
    sourceWindow.timeMax,
  );
};

const compareMappingSlots = (first: EventMapping, second: EventMapping): number =>
  first.startTime.getTime() - second.startTime.getTime()
  || first.endTime.getTime() - second.endTime.getTime()
  || first.id.localeCompare(second.id);

const compareEventSlots = (
  first: MaterializedSyncableEvent,
  second: MaterializedSyncableEvent,
): number => first.startTime.getTime() - second.startTime.getTime()
  || first.endTime.getTime() - second.endTime.getTime()
  || first.id.localeCompare(second.id);

const getSerializedSlotKey = (startTime: Date, endTime: Date): string =>
  `${Math.trunc(startTime.getTime() / 1000)}\u0000${Math.trunc(endTime.getTime() / 1000)}`;

const pairReidentifiedMaterializedOccurrences = (
  localEvents: MaterializedSyncableEvent[],
  existingMappings: EventMapping[],
): OccurrenceReassignment[] => {
  const localEventIds = new Set(localEvents.map((event) => event.id));
  const mappedEventIds = new Set(existingMappings.map((mapping) => getMappingSyncEventId(mapping)));
  const newEventsByOwner = new Map<string, MaterializedSyncableEvent[]>();
  const missingMappingsByOwner = new Map<string, EventMapping[]>();

  for (const event of localEvents) {
    if (!event.eventStateId || mappedEventIds.has(event.id)) {
      continue;
    }
    const events = newEventsByOwner.get(event.eventStateId) ?? [];
    events.push(event);
    newEventsByOwner.set(event.eventStateId, events);
  }

  for (const mapping of existingMappings) {
    if (localEventIds.has(getMappingSyncEventId(mapping))) {
      continue;
    }
    if (!mapping.eventStateId) {
      continue;
    }
    const mappings = missingMappingsByOwner.get(mapping.eventStateId) ?? [];
    mappings.push(mapping);
    missingMappingsByOwner.set(mapping.eventStateId, mappings);
  }

  const reassignments: OccurrenceReassignment[] = [];
  for (const [ownerId, events] of newEventsByOwner) {
    const mappings = missingMappingsByOwner.get(ownerId);
    if (!mappings) {
      continue;
    }
    const orderedEvents = events.toSorted(compareEventSlots);
    const orderedMappings = mappings.toSorted(compareMappingSlots);
    const mappingsBySlot = new Map<string, EventMapping[]>();
    for (const mapping of orderedMappings) {
      const slotKey = getSerializedSlotKey(mapping.startTime, mapping.endTime);
      const slotMappings = mappingsBySlot.get(slotKey) ?? [];
      slotMappings.push(mapping);
      mappingsBySlot.set(slotKey, slotMappings);
    }

    const pairedEventIds = new Set<string>();
    const pairedMappingIds = new Set<string>();
    for (const event of orderedEvents) {
      const slotMappings = mappingsBySlot.get(getSerializedSlotKey(
        event.startTime,
        event.endTime,
      ));
      const mapping = slotMappings?.shift();
      if (!mapping) {
        continue;
      }
      reassignments.push({ event, mapping });
      pairedEventIds.add(event.id);
      pairedMappingIds.add(mapping.id);
    }

    const remainingEvents = orderedEvents.filter((event) => !pairedEventIds.has(event.id));
    const remainingMappings = orderedMappings.filter(
      (mapping) => !pairedMappingIds.has(mapping.id),
    );
    const pairCount = Math.min(remainingEvents.length, remainingMappings.length);
    for (let index = 0; index < pairCount; index++) {
      const event = remainingEvents[index];
      const mapping = remainingMappings[index];
      if (event && mapping) {
        reassignments.push({ event, mapping });
      }
    }
  }

  return reassignments;
};

const isSameSerializedSecond = (first: Date, second: Date): boolean =>
  Math.trunc(first.getTime() / 1000) === Math.trunc(second.getTime() / 1000);

const getRemoteIdentity = (uid: string, deleteId: string): string =>
  `${uid}\u0000${deleteId}`;

const matchRemoteEventsToMappings = (
  mappings: EventMapping[],
  remoteEvents: RemoteEvent[],
): Map<string, RemoteEvent> => {
  const remoteEventsByIdentity = new Map(
    remoteEvents.map((event) => [getRemoteIdentity(event.uid, event.deleteId), event]),
  );
  const remoteEventsByUid = new Map<string, RemoteEvent[]>();
  for (const remoteEvent of remoteEvents) {
    const matchingUidEvents = remoteEventsByUid.get(remoteEvent.uid) ?? [];
    matchingUidEvents.push(remoteEvent);
    remoteEventsByUid.set(remoteEvent.uid, matchingUidEvents);
  }

  const matches = new Map<string, RemoteEvent>();
  for (const mapping of mappings) {
    const exactMatch = remoteEventsByIdentity.get(getRemoteIdentity(
      mapping.destinationEventUid,
      mapping.deleteIdentifier,
    ));
    if (exactMatch) {
      matches.set(mapping.id, exactMatch);
      continue;
    }

    if (mapping.deleteIdentifier !== mapping.destinationEventUid) {
      continue;
    }
    const legacyUidMatches = remoteEventsByUid.get(mapping.destinationEventUid) ?? [];
    if (legacyUidMatches.length === 1 && legacyUidMatches[0]) {
      matches.set(mapping.id, legacyUidMatches[0]);
    }
  }

  return matches;
};

const getRemoteStateChanges = (
  mapping: EventMapping,
  localEvent: MaterializedSyncableEvent,
  remoteEvent: RemoteEvent,
): RemoteStateChanges => {
  const remoteContentChanged = typeof remoteEvent.editableContentHash === "string"
    && remoteEvent.editableContentHash !== createEditableEventContentHash(localEvent);
  const localAvailability = localEvent.availability ?? "busy";
  const supportedAvailabilities = remoteEvent.supportedAvailabilities ?? [];
  let expectedRemoteAvailability: MaterializedSyncableEvent["availability"] = "busy";
  if (supportedAvailabilities.includes(localAvailability)) {
    expectedRemoteAvailability = localAvailability;
  }
  const remoteAvailabilityChanged = typeof remoteEvent.editableAvailability === "string"
    && remoteEvent.editableAvailability !== expectedRemoteAvailability;
  const remoteTimeChanged = !isSameSerializedSecond(remoteEvent.startTime, mapping.startTime)
    || !isSameSerializedSecond(remoteEvent.endTime, mapping.endTime);

  return {
    availability: remoteAvailabilityChanged,
    content: remoteContentChanged,
    time: remoteTimeChanged,
  };
};

const hasRemoteStateChanged = (changes: RemoteStateChanges): boolean =>
  changes.availability || changes.content || changes.time;

const resolveEffectiveChanges = (
  mode: EchoComparisonMode,
  echo: RemoteStateChanges,
  legacy: RemoteStateChanges,
): RemoteStateChanges => {
  if (mode === "on") {
    return echo;
  }
  return legacy;
};

interface RemoteDecision {
  echo: RemoteStateChanges;
  echoState: EchoState;
  effective: RemoteStateChanges;
  legacy: RemoteStateChanges;
  observedEcho: string | null;
  recordingNeeded: boolean;
}

/*
 * Records what this run observed about one eligible mapping and proposes the
 * observation to store. A mapping that is stale this run has its row deleted and
 * re-inserted by the replace, so an observation against it would be written against
 * an identifier that no longer exists.
 */
const recordEchoObservation = (
  counts: EchoCounts,
  mappingId: string,
  decision: RemoteDecision,
  contentChanged: boolean,
): EchoAdoption | null => {
  counts.eligibleCount += 1;
  if (decision.echoState === "absent") {
    counts.missingCount += 1;
  } else if (decision.echoState === "unconfirmed") {
    counts.unconfirmedCount += 1;
  }
  if (decision.echo.content) {
    counts.contentChangedCount += 1;
  } else if (decision.legacy.content) {
    counts.avoidedContentChangedCount += 1;
  }

  if (contentChanged || decision.observedEcho === null || !decision.recordingNeeded) {
    return null;
  }
  if (decision.legacy.content) {
    counts.adoptionLocalDivergenceCount += 1;
  }
  return { contentHash: decision.observedEcho, mappingId };
};

/*
 * Decides every dimension reconciliation can find a mirror stale in. The echo verdict
 * accepts a read-back the destination has already accounted for -- the state it reported
 * storing when we pushed, or the read-back its predecessor was replaced for and that
 * survived a fresh push -- so a lossy but deterministic provider rewrite of the content,
 * the times, or the availability settles instead of being replaced forever, while a
 * read-back nothing accounts for is still a divergence to repair. A dimension the
 * destination never reported is unknown rather than equal, so it keeps comparing against
 * the local event. The legacy verdict is always computed, because it is the standing
 * measure of how far a mirror sits from its source.
 */
const resolveRemoteDecision = (
  mapping: EventMapping,
  localEvent: MaterializedSyncableEvent,
  remoteEvent: RemoteEvent,
  mode: EchoComparisonMode,
): RemoteDecision => {
  const legacy = getRemoteStateChanges(mapping, localEvent, remoteEvent);
  const echoState = resolveEchoState(mapping);
  const observation = readRemoteStateObservation(remoteEvent);
  if (observation === null) {
    return {
      echo: legacy,
      echoState,
      effective: legacy,
      legacy,
      observedEcho: null,
      recordingNeeded: false,
    };
  }

  const recordedEcho = readRecordedEcho(mapping);
  const echoes = [
    parseRemoteStateEcho(recordedEcho),
    parseRemoteStateEcho(readRejectedEcho(mapping)),
  ];
  const accountsFor = (
    accounts: (echo: RemoteStateEcho | null, observed: RemoteStateObservation) => boolean,
  ): boolean => echoes.some((echo) => accounts(echo, observation));

  const observedEcho = serializeRemoteStateEcho(observation);
  const echo: RemoteStateChanges = {
    availability: legacy.availability && !accountsFor(echoAccountsForAvailability),
    content: legacy.content && !accountsFor(echoAccountsForContent),
    time: legacy.time && !accountsFor(echoAccountsForTime),
  };

  return {
    echo,
    echoState,
    effective: resolveEffectiveChanges(mode, echo, legacy),
    legacy,
    observedEcho,
    recordingNeeded: !(echoState === "confirmed"
      && observedEcho === recordedEcho
      && mapping.remoteRejectedContentHash === null),
  };
};

const countStaleReasons = (
  counts: StaleReasonCounts,
  localHashChanged: boolean,
  changes: RemoteStateChanges,
): void => {
  if (localHashChanged) {
    counts.localHashChanged += 1;
  }
  if (changes.availability) {
    counts.remoteAvailabilityChanged += 1;
  }
  if (changes.content) {
    counts.remoteContentChanged += 1;
  }
  if (changes.time) {
    counts.remoteTimeChanged += 1;
  }
};

const identifyStaleMappings = (
  mappings: EventMapping[],
  localEventIds: Set<string>,
  remoteEventsByMappingId: Map<string, RemoteEvent>,
  localEventsById: Map<string, MaterializedSyncableEvent>,
  echoOptions: EchoReconciliationOptions,
): StaleMappingResult => {
  const staleMappingIds: string[] = [];
  const staleMappedEventIds = new Set<string>();
  const staleRemoteMappings: EventMapping[] = [];
  const staleReasonCounts = createStaleReasonCounts();
  const echoCounts = createEchoCounts();
  const candidateAdoptions: EchoAdoption[] = [];
  const rejectedContentHashes = new Map<string, string>();
  const retiredRejectedEchoes = new Map<string, string>();

  for (const mapping of mappings) {
    const syncEventId = getMappingSyncEventId(mapping);
    const localEventExists = localEventIds.has(syncEventId);
    const remoteEvent = remoteEventsByMappingId.get(mapping.id);
    if (localEventExists && !remoteEvent) {
      staleReasonCounts.remoteMissing += 1;
      staleMappingIds.push(mapping.id);
      staleMappedEventIds.add(syncEventId);
      staleRemoteMappings.push(mapping);
      continue;
    }

    if (!localEventExists || !remoteEvent) {
      continue;
    }

    const localEvent = localEventsById.get(syncEventId);
    if (!localEvent) {
      continue;
    }

    const localEventHash = createSyncEventContentHash(localEvent);
    const localHashChanged = mapping.syncEventHash !== localEventHash;
    const decision = resolveRemoteDecision(
      mapping,
      localEvent,
      remoteEvent,
      echoOptions.mode,
    );
    const remoteChanges = decision.effective;
    const otherReasonStale = localHashChanged
      || remoteChanges.availability
      || remoteChanges.time;

    if (decision.legacy.content) {
      echoCounts.legacyContentChangedCount += 1;
    }

    if (decision.observedEcho !== null && !otherReasonStale) {
      const adoption = recordEchoObservation(
        echoCounts,
        mapping.id,
        decision,
        remoteChanges.content,
      );
      if (adoption) {
        candidateAdoptions.push(adoption);
      }
    }

    if (otherReasonStale || remoteChanges.content) {
      countStaleReasons(staleReasonCounts, localHashChanged, remoteChanges);
      if (remoteChanges.content && decision.observedEcho !== null) {
        rejectedContentHashes.set(mapping.id, decision.observedEcho);
      }
      staleMappingIds.push(mapping.id);
      staleMappedEventIds.add(syncEventId);
      staleRemoteMappings.push(mapping);
      continue;
    }

    /*
     * The one-shot allowance a replacement carries for the read-back it rejected is
     * retired here, through the same flush that carries the run's other mapping
     * writes: the observation channel is best-effort by design, and an allowance that
     * outlives the read-back it was granted for accepts a destination-side edit that
     * reproduces it as truth.
     */
    if (mapping.remoteRejectedContentHash !== null && decision.observedEcho !== null) {
      retiredRejectedEchoes.set(mapping.id, decision.observedEcho);
    }
  }

  const adoptionIntents = candidateAdoptions
    .filter((adoption) => !retiredRejectedEchoes.has(adoption.mappingId))
    .toSorted((first, second) => first.mappingId.localeCompare(second.mappingId))
    .slice(0, echoOptions.maxAdoptionsPerRun);

  return {
    adoptionIntents,
    echoCounts: { ...echoCounts, adoptedCount: adoptionIntents.length },
    rejectedContentHashes,
    retiredRejectedEchoes,
    staleMappedEventIds,
    staleMappingIds,
    staleReasonCounts,
    staleRemoteMappings,
  };
};

const buildAddOperations = (
  localEvents: MaterializedSyncableEvent[],
  existingMappings: EventMapping[],
  staleMappedEventIds: Set<string>,
): SyncOperation[] => {
  const operations: SyncOperation[] = [];
  const mappingsBySyncEventId = new Map<string, EventMapping>();
  for (const mapping of existingMappings) {
    const syncEventId = getMappingSyncEventId(mapping);
    if (!mappingsBySyncEventId.has(syncEventId)) {
      mappingsBySyncEventId.set(syncEventId, mapping);
    }
  }

  for (const event of localEvents) {
    const existingMapping = mappingsBySyncEventId.get(event.id);
    const hasMapping = Boolean(existingMapping);
    const hasStaleMapping = staleMappedEventIds.has(event.id);

    if (!hasMapping || hasStaleMapping) {
      operations.push({
        event,
        type: "add",
        ...(hasStaleMapping && existingMapping && { staleMappingId: existingMapping.id }),
      });
    }
  }

  return operations;
};

const buildRemoveOperationsForMappings = (mappings: EventMapping[]): SyncOperation[] =>
  mappings.map((mapping) => ({
    deleteId: mapping.deleteIdentifier,
    startTime: mapping.startTime,
    type: "remove",
    uid: mapping.destinationEventUid,
  }));

/*
 * A mapping written before delete identifiers were recorded stores the iCalUID, which
 * Google's delete endpoint does not accept: the destination provider spends a second
 * batch request resolving that UID back to an event id, doubling the rate-limit cost
 * of the delete. Reconciliation has just listed the remote copy, so its provider id is
 * already in hand and the lookup is only needed when no remote copy was matched.
 */
const resolveMappingDeleteId = (
  mapping: EventMapping,
  remoteEventsByMappingId: ReadonlyMap<string, RemoteEvent>,
): string => remoteEventsByMappingId.get(mapping.id)?.deleteId ?? mapping.deleteIdentifier;

/*
 * A replacement forced by a content divergence carries the read-back it rejected, so
 * the mapping it creates can tell a destination that renders its own stored copy that
 * way from one a guest edited: the first repeats after a fresh push, the second does not.
 */
const buildReplacementOperations = (
  mappings: EventMapping[],
  localEventsById: Map<string, MaterializedSyncableEvent>,
  remoteEventsByMappingId: ReadonlyMap<string, RemoteEvent>,
  rejectedContentHashes: ReadonlyMap<string, string> = new Map(),
): SyncOperation[] => {
  const operations: SyncOperation[] = [];
  for (const mapping of mappings) {
    const event = localEventsById.get(getMappingSyncEventId(mapping));
    if (!event) {
      continue;
    }
    const rejectedContentHash = rejectedContentHashes.get(mapping.id);
    operations.push({
      deleteId: resolveMappingDeleteId(mapping, remoteEventsByMappingId),
      event,
      staleMappingId: mapping.id,
      type: "replace",
      uid: mapping.destinationEventUid,
      ...(rejectedContentHash && { rejectedContentHash }),
    });
  }
  return operations;
};

const getOperationEventTime = (operation: SyncOperation): Date => {
  if (operation.type === "add" || operation.type === "replace") {
    return operation.event.startTime;
  }
  return operation.startTime;
};

const getOperationTypePriority = (operation: SyncOperation): number => {
  if (operation.type === "remove") {
    return 0;
  }
  return 1;
};

const sortOperationsByTime = (operations: SyncOperation[]): SyncOperation[] =>
  operations.toSorted((first, second) => {
    const timeDiff = getOperationEventTime(first).getTime() - getOperationEventTime(second).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return getOperationTypePriority(first) - getOperationTypePriority(second);
  });

const buildRemoveOperations = (
  existingMappings: EventMapping[],
  remoteEvents: RemoteEvent[],
  localEventIds: Set<string>,
  mappedRemoteIdentities: Set<string>,
  remoteEventsByMappingId: ReadonlyMap<string, RemoteEvent>,
  scope: ReconciliationScope,
): SyncOperation[] => {
  const operations: SyncOperation[] = [];

  for (const mapping of existingMappings) {
    /*
     * Both edges of the requested window retire a mapping. A mirror the window no
     * longer covers stops receiving updates, and a stale copy that never reflects a
     * rename, move, or deletion of its source reads as broken sync. The source event
     * itself is retained in Keeper's own store, so retiring the mirror narrows scope
     * rather than losing data.
     */
    const outsideCleanupWindow = !overlapsTimeWindow(
      mapping,
      scope.requestedWindow.timeMin,
      scope.requestedWindow.timeMax,
    );
    const insideAuthoritativeWindow = isInsideSourceAuthoritativeWindow(
      mapping,
      mapping.sourceCalendarId,
      scope,
    );
    /*
     * A series withheld for exceeding the occurrence budget is absent from the local
     * read for a technical limit, not because it is gone. Deleting its mirrors here
     * would mass-delete and then mass-re-add them the moment the window changes, so
     * the missing-source path leaves them alone. Window cleanup above still applies.
     */
    const isWithheldSeriesMapping = mapping.eventStateId !== null
      && Boolean(scope.withheldSourceEventStateIds?.has(mapping.eventStateId));
    if (
      outsideCleanupWindow
      || insideAuthoritativeWindow
        && !isWithheldSeriesMapping
        && !localEventIds.has(getMappingSyncEventId(mapping))
    ) {
      operations.push({
        deleteId: resolveMappingDeleteId(mapping, remoteEventsByMappingId),
        startTime: mapping.startTime,
        type: "remove",
        uid: mapping.destinationEventUid,
      });
    }
  }

  for (const remoteEvent of remoteEvents) {
    if (mappedRemoteIdentities.has(`${remoteEvent.uid}\u0000${remoteEvent.deleteId}`)) {
      continue;
    }

    if (!remoteEvent.isKeeperEvent) {
      continue;
    }

    if (!scope.authoritativeWindow || !overlapsTimeWindow(
      remoteEvent,
      scope.authoritativeWindow.timeMin,
      scope.authoritativeWindow.timeMax,
    )) {
      continue;
    }

    operations.push({
      deleteId: remoteEvent.deleteId,
      startTime: remoteEvent.startTime,
      type: "remove",
      uid: remoteEvent.uid,
    });
  }

  return operations;
};

const hasStaleDeleteIdentifier = (
  mapping: EventMapping,
  remoteEvent: RemoteEvent,
): boolean => mapping.deleteIdentifier === mapping.destinationEventUid
  && remoteEvent.deleteId !== mapping.deleteIdentifier;

const resolveUpdatedDeleteIdentifier = (
  mapping: EventMapping,
  remoteEvent: RemoteEvent,
): string => {
  if (hasStaleDeleteIdentifier(mapping, remoteEvent)) {
    return remoteEvent.deleteId;
  }
  return mapping.deleteIdentifier;
};

const buildStandardMappingUpdate = (
  mapping: EventMapping,
  localEvent: MaterializedSyncableEvent | undefined,
  remoteEvent: RemoteEvent | undefined,
  retiredEcho: string | null,
): MappingUpdate | null => {
  if (!localEvent || !remoteEvent) {
    return null;
  }
  const deleteIdentifierStale = hasStaleDeleteIdentifier(mapping, remoteEvent);
  if (!deleteIdentifierStale && retiredEcho === null) {
    return null;
  }
  return {
    deleteIdentifier: resolveUpdatedDeleteIdentifier(mapping, remoteEvent),
    id: mapping.id,
    syncEventHash: createSyncEventContentHash(localEvent),
    syncEventId: localEvent.id,
    ...(retiredEcho !== null && { remoteEcho: { contentHash: retiredEcho } }),
  };
};

/*
 * Judged by the same echo-aware verdict reconciliation uses, so a read-back the
 * destination already accounted for still buys the free database remap an occurrence id
 * re-materialization deserves rather than a delete and a re-create.
 */
const resolveReassignmentDecision = (
  { event, mapping }: OccurrenceReassignment,
  remoteEvent: RemoteEvent | undefined,
  mode: EchoComparisonMode,
): RemoteDecision | null => {
  const remoteStateIsVerifiable = typeof remoteEvent?.editableAvailability === "string"
    && typeof remoteEvent.editableContentHash === "string";
  if (!remoteEvent || !remoteStateIsVerifiable) {
    return null;
  }
  return resolveRemoteDecision(mapping, event, remoteEvent, mode);
};

/*
 * A read-back the echo accounts for says nothing about the source, so it only earns the
 * free remap when the occurrence carries the content the mapping was written for; a
 * read-back that matches the source itself needs no such corroboration.
 */
const canRemapReassignmentInDatabase = (
  { event, mapping }: OccurrenceReassignment,
  decision: RemoteDecision | null,
): boolean => {
  if (decision === null) {
    return false;
  }
  const mappingMatchesOccurrence = isSameSerializedSecond(mapping.startTime, event.startTime)
    && isSameSerializedSecond(mapping.endTime, event.endTime);
  if (!mappingMatchesOccurrence) {
    return false;
  }
  if (!hasRemoteStateChanged(decision.legacy)) {
    return true;
  }
  return !hasRemoteStateChanged(decision.effective)
    && mapping.syncEventHash === createSyncEventContentHash(event);
};

const computeSyncOperations = (
  localEvents: MaterializedSyncableEvent[],
  existingMappings: EventMapping[],
  remoteEvents: RemoteEvent[],
  scope: ReconciliationScope,
  echoOptions: EchoReconciliationOptions = createDisabledEchoOptions(),
): ComputeSyncOperationsResult => {
  const authoritativeLocalEvents: MaterializedSyncableEvent[] = [];
  const activeMappings: EventMapping[] = [];
  authoritativeLocalEvents.push(...localEvents.filter((event) =>
    isInsideSourceAuthoritativeWindow(event, event.calendarId, scope)));
  activeMappings.push(...existingMappings.filter((mapping) =>
    isInsideSourceAuthoritativeWindow(mapping, mapping.sourceCalendarId, scope)));
  const localEventIds = new Set(authoritativeLocalEvents.map((event) => event.id));
  const localEventsById = new Map(authoritativeLocalEvents.map((event) => [event.id, event]));
  const remoteEventsByMappingId = matchRemoteEventsToMappings(existingMappings, remoteEvents);
  const occurrenceReassignments = pairReidentifiedMaterializedOccurrences(
    authoritativeLocalEvents,
    activeMappings,
  );
  const databaseOnlyReassignments: OccurrenceReassignment[] = [];
  const remoteReassignments: OccurrenceReassignment[] = [];
  const reassignmentRejectedEchoes = new Map<string, string>();
  for (const reassignment of occurrenceReassignments) {
    const { mapping } = reassignment;
    const decision = resolveReassignmentDecision(
      reassignment,
      remoteEventsByMappingId.get(mapping.id),
      echoOptions.mode,
    );
    if (canRemapReassignmentInDatabase(reassignment, decision)) {
      databaseOnlyReassignments.push(reassignment);
      continue;
    }
    if (decision?.effective.content && decision.observedEcho !== null) {
      reassignmentRejectedEchoes.set(mapping.id, decision.observedEcho);
    }
    remoteReassignments.push(reassignment);
  }
  const reassignedMappingIds = new Set(
    occurrenceReassignments.map(({ mapping }) => mapping.id),
  );
  const reassignedEventIds = new Set(
    occurrenceReassignments.map(({ event }) => event.id),
  );
  const standardMappings = activeMappings.filter(
    (mapping) => !reassignedMappingIds.has(mapping.id),
  );
  const mappedRemoteIdentities = new Set(
    [...remoteEventsByMappingId.values()].map((remoteEvent) =>
      getRemoteIdentity(remoteEvent.uid, remoteEvent.deleteId)),
  );

  const {
    adoptionIntents,
    echoCounts,
    rejectedContentHashes,
    retiredRejectedEchoes,
    staleMappingIds,
    staleMappedEventIds,
    staleReasonCounts,
    staleRemoteMappings,
  } = identifyStaleMappings(
    standardMappings,
    localEventIds,
    remoteEventsByMappingId,
    localEventsById,
    echoOptions,
  );
  const staleMappingIdSet = new Set(staleMappingIds);
  const mappingUpdatesById = new Map<string, MappingUpdate>();
  for (const mapping of standardMappings) {
    if (staleMappingIdSet.has(mapping.id)) {
      continue;
    }
    const update = buildStandardMappingUpdate(
      mapping,
      localEventsById.get(getMappingSyncEventId(mapping)),
      remoteEventsByMappingId.get(mapping.id),
      retiredRejectedEchoes.get(mapping.id) ?? null,
    );
    if (update) {
      mappingUpdatesById.set(mapping.id, update);
    }
  }
  for (const { event, mapping } of databaseOnlyReassignments) {
    const remoteEvent = remoteEventsByMappingId.get(mapping.id);
    if (!remoteEvent) {
      continue;
    }
    mappingUpdatesById.set(mapping.id, {
      deleteIdentifier: remoteEvent.deleteId,
      id: mapping.id,
      syncEventHash: createSyncEventContentHash(event),
      syncEventId: event.id,
    });
  }

  const replacedEventIds = new Set(
    staleRemoteMappings.map((mapping) => getMappingSyncEventId(mapping)),
  );
  /*
   * Matched against every existing mapping, not just authoritative ones: a mapping
   * between recorded coverage and the requested edge would otherwise look unmapped
   * and be re-added, while its insert is dropped by the mapping uniqueness index
   * and the orphaned remote event is deleted on the next run, forever.
   */
  const addOperations = buildAddOperations(
    authoritativeLocalEvents,
    existingMappings,
    staleMappedEventIds,
  )
    .filter((operation) => operation.type !== "add"
      || !replacedEventIds.has(operation.event.id)
        && !reassignedEventIds.has(operation.event.id));
  const replacementOperations = buildReplacementOperations(
    staleRemoteMappings,
    localEventsById,
    remoteEventsByMappingId,
    rejectedContentHashes,
  );
  const reassignmentOperations: SyncOperation[] = remoteReassignments.map(({
    event,
    mapping,
  }) => {
    const rejectedContentHash = reassignmentRejectedEchoes.get(mapping.id);
    return {
      deleteId: resolveMappingDeleteId(mapping, remoteEventsByMappingId),
      event,
      staleMappingId: mapping.id,
      type: "replace",
      uid: mapping.destinationEventUid,
      ...(rejectedContentHash && { rejectedContentHash }),
    };
  });

  const removeOperations = buildRemoveOperations(
    existingMappings.filter((mapping) => !reassignedMappingIds.has(mapping.id)),
    remoteEvents,
    localEventIds,
    mappedRemoteIdentities,
    remoteEventsByMappingId,
    scope,
  );

  return {
    adoptionIntents,
    echoCounts,
    mappingUpdates: [...mappingUpdatesById.values()],
    operations: sortOperationsByTime([
      ...addOperations,
      ...removeOperations,
      ...replacementOperations,
      ...reassignmentOperations,
    ]),
    staleReasonCounts: {
      ...staleReasonCounts,
      occurrenceReassigned: remoteReassignments.length,
    },
    staleMappingIds: [
      ...staleMappingIds,
      ...remoteReassignments.map(({ mapping }) => mapping.id),
    ],
  };
};

export {
  buildAddOperations,
  createDisabledEchoOptions,
  DEFAULT_ECHO_ADOPTION_MAX_PER_RUN,
  buildRemoveOperations,
  buildRemoveOperationsForMappings,
  buildReplacementOperations,
  computeSyncOperations,
  identifyStaleMappings,
  matchRemoteEventsToMappings,
  pairReidentifiedMaterializedOccurrences,
};
export type {
  ComputeSyncOperationsResult,
  EchoAdoption,
  EchoComparisonMode,
  EchoCounts,
  EchoReconciliationOptions,
  MappingUpdate,
  OccurrenceReassignment,
  ReconciliationScope,
  StaleMappingResult,
  StaleReasonCounts,
};
