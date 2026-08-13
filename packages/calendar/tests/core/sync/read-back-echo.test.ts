import { describe, expect, it } from "vitest";
import {
  computeSyncOperations as computeSyncOperationsStrict,
} from "../../../src/core/sync/operations";
import type {
  EchoAdoption,
  EchoReconciliationOptions,
  ReconciliationScope,
} from "../../../src/core/sync/operations";
import {
  createEditableEventContentHash,
  createSyncEventContentHash,
  EDITABLE_CONTENT_ECHO_ALGORITHM,
} from "../../../src/core/events/content-hash";
import type { EventMapping } from "../../../src/core/events/mappings";
import type {
  MaterializedSyncableEvent,
  RemoteEvent,
  SyncOperation,
} from "../../../src/core/types";

const NOW = new Date("2026-03-08T12:00:00.000Z");
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const TEST_WINDOW = {
  timeMax: new Date("2100-01-01T00:00:00.000Z"),
  timeMin: new Date("2000-01-01T00:00:00.000Z"),
};

const SCOPE: ReconciliationScope = {
  authoritativeWindow: TEST_WINDOW,
  requestedWindow: TEST_WINDOW,
};

const createLocalEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description: "Original body",
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Meeting",
  ...overrides,
});

const createEventMapping = (overrides: Partial<EventMapping> = {}): EventMapping => ({
  calendarId: "destination-calendar-id",
  deleteIdentifier: "delete-identifier-1",
  destinationEventUid: "destination-uid-1",
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  eventStateId: "event-state-id-1",
  id: "mapping-id-1",
  remoteContentHash: null,
  remoteEchoAlgorithm: null,
  remoteEchoAt: null,
  sourceCalendarId: "source-calendar-id",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  syncEventHash: "hash-1",
  syncEventId: "event-state-id-1",
  ...overrides,
});

const createRemoteEvent = (overrides: Partial<RemoteEvent> = {}): RemoteEvent => ({
  deleteId: "delete-identifier-1",
  editableAvailability: "busy",
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  isKeeperEvent: true,
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  supportedAvailabilities: ["busy", "free"],
  uid: "destination-uid-1",
  ...overrides,
});

const createEchoOptions = (
  overrides: Partial<EchoReconciliationOptions> = {},
): EchoReconciliationOptions => ({
  maxAdoptionsPerRun: 2000,
  maxAgeMs: ONE_DAY_MS,
  mode: "on",
  now: NOW,
  repairOnAdopt: false,
  ...overrides,
});

const compute = (
  localEvents: MaterializedSyncableEvent[],
  mappings: EventMapping[],
  remoteEvents: RemoteEvent[],
  echo: Partial<EchoReconciliationOptions> = {},
) => computeSyncOperationsStrict(
  localEvents,
  mappings,
  remoteEvents,
  SCOPE,
  createEchoOptions(echo),
);

const applyAdoptions = (
  mappings: EventMapping[],
  adoptions: EchoAdoption[],
  recordedAt: Date,
): EventMapping[] => {
  const adoptionsByMappingId = new Map(
    adoptions.map((adoption) => [adoption.mappingId, adoption]),
  );
  return mappings.map((mapping) => {
    const adoption = adoptionsByMappingId.get(mapping.id);
    if (!adoption) {
      return mapping;
    }
    return {
      ...mapping,
      remoteContentHash: adoption.contentHash,
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: recordedAt,
    };
  });
};

const countReplacements = (operations: SyncOperation[]): number =>
  operations.filter((operation) => operation.type === "replace").length;

/*
 * Stands in for a destination that stores something other than exactly what was
 * pushed: the read-back always reports the local content with the description
 * rewritten, deterministically, so the local comparison can never converge.
 */
const rewriteContent = (event: MaterializedSyncableEvent): string =>
  createEditableEventContentHash({
    ...event,
    description: `${event.description ?? ""}<br>`,
  });

describe("read-back echo comparison", () => {
  it("converges after one cycle against a provider that rewrites content", () => {
    const localEvent = createLocalEvent();
    const rewrittenHash = rewriteContent(localEvent);
    const remoteEvent = createRemoteEvent({ editableContentHash: rewrittenHash });
    let mappings = [createEventMapping({
      syncEventHash: createSyncEventContentHash(localEvent),
    })];

    const first = compute([localEvent], mappings, [remoteEvent]);
    expect(countReplacements(first.operations)).toBe(0);
    expect(first.staleReasonCounts.remoteContentChanged).toBe(0);
    expect(first.adoptionIntents).toEqual([
      { contentHash: rewrittenHash, mappingId: "mapping-id-1" },
    ]);
    expect(first.echoCounts).toMatchObject({
      adoptionLocalDivergenceCount: 1,
      eligibleCount: 1,
      legacyContentChangedCount: 1,
      missingCount: 1,
      staleCount: 0,
    });

    mappings = applyAdoptions(mappings, first.adoptionIntents, NOW);

    const second = compute([localEvent], mappings, [remoteEvent], {
      now: new Date(NOW.getTime() + ONE_HOUR_MS),
    });
    expect(second.operations).toHaveLength(0);
    expect(second.adoptionIntents).toHaveLength(0);
    expect(second.echoCounts).toMatchObject({
      contentChangedCount: 0,
      eligibleCount: 1,
      legacyContentChangedCount: 1,
      missingCount: 0,
    });

    const third = compute([localEvent], mappings, [remoteEvent], {
      now: new Date(NOW.getTime() + 2 * ONE_HOUR_MS),
    });
    expect(third.operations).toHaveLength(0);
    expect(third.adoptionIntents).toHaveLength(0);
  });

  it("still replaces when the source event itself changed", () => {
    const localEvent = createLocalEvent({ summary: "Renamed meeting" });
    const remoteHash = rewriteContent(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: remoteHash,
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(createLocalEvent()),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({ editableContentHash: remoteHash })],
    );

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.staleReasonCounts.localHashChanged).toBe(1);
    expect(result.adoptionIntents).toHaveLength(0);
  });

  it("detects a remote content edit made after adoption", () => {
    const localEvent = createLocalEvent();
    const adoptedHash = rewriteContent(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: adoptedHash,
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });
    const editedRemote = createRemoteEvent({
      editableContentHash: createEditableEventContentHash({
        ...localEvent,
        summary: "Hijacked by a guest",
      }),
    });

    const result = compute([localEvent], [mapping], [editedRemote], {
      now: new Date(NOW.getTime() + ONE_HOUR_MS),
    });

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(1);
    expect(result.echoCounts.contentChangedCount).toBe(1);
    expect(result.adoptionIntents).toHaveLength(0);
  });

  it("re-observes rather than replacing once an echo passes the age bound", () => {
    const localEvent = createLocalEvent();
    const driftedHash = createEditableEventContentHash({
      ...localEvent,
      summary: "Drifted away from its source",
    });
    const mapping = createEventMapping({
      remoteContentHash: rewriteContent(localEvent),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: new Date(NOW.getTime() - 2 * ONE_DAY_MS),
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({ editableContentHash: driftedHash })],
    );

    expect(countReplacements(result.operations)).toBe(0);
    expect(result.adoptionIntents).toEqual([
      { contentHash: driftedHash, mappingId: "mapping-id-1" },
    ]);
    expect(result.echoCounts).toMatchObject({
      adoptionLocalDivergenceCount: 1,
      missingCount: 0,
      staleCount: 1,
    });
  });

  it("repairs an aged divergent echo only when repair on adopt is enabled", () => {
    const localEvent = createLocalEvent();
    const driftedHash = createEditableEventContentHash({
      ...localEvent,
      summary: "Drifted away from its source",
    });
    const mapping = createEventMapping({
      remoteContentHash: rewriteContent(localEvent),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: new Date(NOW.getTime() - 2 * ONE_DAY_MS),
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({ editableContentHash: driftedHash })],
      { repairOnAdopt: true },
    );

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(1);
    expect(result.adoptionIntents).toHaveLength(0);
  });

  it("produces no replacements for a fleet whose echoes all aged out", () => {
    const localEvents: MaterializedSyncableEvent[] = [];
    const mappings: EventMapping[] = [];
    const remoteEvents: RemoteEvent[] = [];
    for (let index = 0; index < 250; index++) {
      const localEvent = createLocalEvent({ id: `event-${index}` });
      localEvents.push(localEvent);
      mappings.push(createEventMapping({
        deleteIdentifier: `delete-${index}`,
        destinationEventUid: `uid-${index}`,
        eventStateId: `event-${index}`,
        id: `mapping-${index}`,
        remoteContentHash: createEditableEventContentHash({
          ...localEvent,
          summary: `Long gone ${index}`,
        }),
        remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
        remoteEchoAt: new Date(NOW.getTime() - 7 * ONE_DAY_MS),
        syncEventHash: createSyncEventContentHash(localEvent),
        syncEventId: `event-${index}`,
      }));
      remoteEvents.push(createRemoteEvent({
        deleteId: `delete-${index}`,
        editableContentHash: rewriteContent(localEvent),
        uid: `uid-${index}`,
      }));
    }

    const result = compute(localEvents, mappings, remoteEvents);

    expect(result.operations).toHaveLength(0);
    expect(result.adoptionIntents).toHaveLength(250);
    expect(result.echoCounts.staleCount).toBe(250);
  });

  it("produces no replacements on a fleet that has never recorded an echo", () => {
    const localEvents: MaterializedSyncableEvent[] = [];
    const mappings: EventMapping[] = [];
    const remoteEvents: RemoteEvent[] = [];
    for (let index = 0; index < 250; index++) {
      const localEvent = createLocalEvent({ id: `event-${index}` });
      localEvents.push(localEvent);
      mappings.push(createEventMapping({
        deleteIdentifier: `delete-${index}`,
        destinationEventUid: `uid-${index}`,
        eventStateId: `event-${index}`,
        id: `mapping-${index}`,
        syncEventHash: createSyncEventContentHash(localEvent),
        syncEventId: `event-${index}`,
      }));
      remoteEvents.push(createRemoteEvent({
        deleteId: `delete-${index}`,
        editableContentHash: rewriteContent(localEvent),
        uid: `uid-${index}`,
      }));
    }

    const result = compute(localEvents, mappings, remoteEvents);

    expect(result.operations).toHaveLength(0);
    expect(result.echoCounts.missingCount).toBe(250);
    expect(result.echoCounts.eligibleCount).toBe(250);
  });

  it("treats an echo written by another algorithm as absent", () => {
    const localEvent = createLocalEvent();
    const remoteHash = rewriteContent(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: remoteHash,
      remoteEchoAlgorithm: "something-else",
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({ editableContentHash: remoteHash })],
    );

    expect(countReplacements(result.operations)).toBe(0);
    expect(result.echoCounts.missingCount).toBe(1);
    expect(result.adoptionIntents).toEqual([
      { contentHash: remoteHash, mappingId: "mapping-id-1" },
    ]);
  });

  it("orders adoption intents by mapping id and caps them per run", () => {
    const localEvents: MaterializedSyncableEvent[] = [];
    const mappings: EventMapping[] = [];
    const remoteEvents: RemoteEvent[] = [];
    for (const index of [4, 2, 0, 3, 1]) {
      const localEvent = createLocalEvent({ id: `event-${index}` });
      localEvents.push(localEvent);
      mappings.push(createEventMapping({
        deleteIdentifier: `delete-${index}`,
        destinationEventUid: `uid-${index}`,
        eventStateId: `event-${index}`,
        id: `mapping-${index}`,
        syncEventHash: createSyncEventContentHash(localEvent),
        syncEventId: `event-${index}`,
      }));
      remoteEvents.push(createRemoteEvent({
        deleteId: `delete-${index}`,
        editableContentHash: rewriteContent(localEvent),
        uid: `uid-${index}`,
      }));
    }

    const result = compute(localEvents, mappings, remoteEvents, {
      maxAdoptionsPerRun: 2,
    });

    expect(result.adoptionIntents.map((intent) => intent.mappingId)).toEqual([
      "mapping-0",
      "mapping-1",
    ]);
    expect(result.echoCounts.missingCount).toBe(5);
  });

  it("keeps the availability comparison local while the echo is fresh and matching", () => {
    const localEvent = createLocalEvent({ availability: "free" });
    const remoteHash = rewriteContent(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: remoteHash,
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({
        editableAvailability: "busy",
        editableContentHash: remoteHash,
      })],
    );

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.staleReasonCounts.remoteAvailabilityChanged).toBe(1);
    expect(result.echoCounts.eligibleCount).toBe(0);
    expect(result.adoptionIntents).toHaveLength(0);
  });

  it("keeps the time comparison against the mapping while the echo is fresh", () => {
    const localEvent = createLocalEvent();
    const remoteHash = rewriteContent(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: remoteHash,
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({
        editableContentHash: remoteHash,
        startTime: new Date("2026-03-08T14:30:00.000Z"),
      })],
    );

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.staleReasonCounts.remoteTimeChanged).toBe(1);
    expect(result.adoptionIntents).toHaveLength(0);
  });

  it("keeps replacing a mapping whose remote copy is missing", () => {
    const localEvent = createLocalEvent();
    const mapping = createEventMapping({
      remoteContentHash: rewriteContent(localEvent),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute([localEvent], [mapping], []);

    expect(result.staleReasonCounts.remoteMissing).toBe(1);
    expect(countReplacements(result.operations)).toBe(1);
    expect(result.adoptionIntents).toHaveLength(0);
    expect(result.echoCounts.eligibleCount).toBe(0);
  });

  it("emits no adoption intent for a mapping already stale for another reason", () => {
    const localEvent = createLocalEvent({ summary: "Renamed meeting" });
    const mapping = createEventMapping({
      syncEventHash: createSyncEventContentHash(createLocalEvent()),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({ editableContentHash: rewriteContent(localEvent) })],
    );

    expect(result.staleReasonCounts.localHashChanged).toBe(1);
    expect(result.adoptionIntents).toHaveLength(0);
    expect(result.echoCounts.eligibleCount).toBe(0);
    expect(result.echoCounts.adoptedCount).toBe(0);
  });

  it("skips the content dimension when the provider supplies no hash", () => {
    const localEvent = createLocalEvent();
    const mapping = createEventMapping({
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute([localEvent], [mapping], [createRemoteEvent()]);

    expect(result.operations).toHaveLength(0);
    expect(result.echoCounts.eligibleCount).toBe(0);
    expect(result.adoptionIntents).toHaveLength(0);
  });

  it("computes both verdicts in shadow mode while the legacy rule still drives", () => {
    const localEvent = createLocalEvent();
    const localHash = createEditableEventContentHash(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: createEditableEventContentHash({
        ...localEvent,
        summary: "Recorded under a different observation",
      }),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });
    const remoteEvent = createRemoteEvent({ editableContentHash: localHash });

    const shadow = compute([localEvent], [mapping], [remoteEvent], {
      mode: "shadow",
    });
    expect(countReplacements(shadow.operations)).toBe(0);
    expect(shadow.staleReasonCounts.remoteContentChanged).toBe(0);
    expect(shadow.echoCounts.contentChangedCount).toBe(1);
    expect(shadow.echoCounts.legacyContentChangedCount).toBe(0);

    const enabled = compute([localEvent], [mapping], [remoteEvent], { mode: "on" });
    expect(countReplacements(enabled.operations)).toBe(1);
    expect(enabled.staleReasonCounts.remoteContentChanged).toBe(1);
  });

  it("keeps the legacy rule driving in off mode while the echo would converge", () => {
    const localEvent = createLocalEvent();
    const rewrittenHash = rewriteContent(localEvent);
    const mapping = createEventMapping({
      remoteContentHash: rewrittenHash,
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventHash: createSyncEventContentHash(localEvent),
    });

    const result = compute(
      [localEvent],
      [mapping],
      [createRemoteEvent({ editableContentHash: rewrittenHash })],
      { mode: "off" },
    );

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(1);
    expect(result.echoCounts.contentChangedCount).toBe(0);
    expect(result.echoCounts.legacyContentChangedCount).toBe(1);
  });

  it("keeps an occurrence reassignment remote when the echo matches but the source does not", () => {
    const reassignedEvent = createLocalEvent({
      id: "event-state-instance-2",
      summary: "Renamed occurrence",
    });
    const mapping = createEventMapping({
      eventStateId: "series-id",
      id: "mapping-id-1",
      remoteContentHash: createEditableEventContentHash(createLocalEvent()),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: NOW,
      syncEventId: "event-state-instance-1",
    });
    const remoteEvent = createRemoteEvent({
      editableContentHash: createEditableEventContentHash(createLocalEvent()),
    });

    const result = compute(
      [{ ...reassignedEvent, eventStateId: "series-id" }],
      [mapping],
      [remoteEvent],
    );

    expect(countReplacements(result.operations)).toBe(1);
    expect(result.operations[0]).toMatchObject({
      staleMappingId: "mapping-id-1",
      type: "replace",
    });
    expect(result.mappingUpdates).toHaveLength(0);
  });
});
