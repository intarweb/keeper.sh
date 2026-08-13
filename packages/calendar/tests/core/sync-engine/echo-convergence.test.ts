import { describe, expect, it } from "vitest";
import { syncCalendar } from "../../../src/core/sync-engine/index";
import type {
  CalendarSyncProvider,
  PendingChanges,
  PendingInsert,
} from "../../../src/core/sync-engine/types";
import type { EchoAdoption } from "../../../src/core/sync/operations";
import { EDITABLE_CONTENT_ECHO_ALGORITHM } from "../../../src/core/events/content-hash";
import { createEditableEventContentHash } from "../../../src/core/events/content-hash";
import type {
  EventMapping,
  MaterializedSyncableEvent,
  RemoteEvent,
} from "../../../src/index";

const DESTINATION_CALENDAR_ID = "destination-calendar";
const START = new Date("2027-03-08T16:00:00.000Z");
const END = new Date("2027-03-08T17:00:00.000Z");

const TEST_RECONCILIATION_SCOPE = {
  authoritativeWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
  requestedWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
};

/*
 * Stands in for a destination that stores something other than what it was sent and
 * reports the rewritten form back on every read, which is the shape that makes the
 * local comparison replace the same mirror forever.
 */
const storeLossily = (event: MaterializedSyncableEvent): MaterializedSyncableEvent => ({
  ...event,
  description: `<div>${event.description ?? ""}</div>`,
});

const resolveEchoAlgorithm = (insert: PendingInsert): string | null => {
  if (insert.remoteContentHash === null && insert.remoteRejectedContentHash === null) {
    return null;
  }
  return EDITABLE_CONTENT_ECHO_ALGORITHM;
};

const createHarness = (options: {
  adoptionEnabled?: boolean;
  failAdoption?: boolean;
  listRewrite?: (remote: RemoteEvent) => RemoteEvent;
  mode?: "off" | "shadow" | "on";
} = {}) => {
  const mappings: EventMapping[] = [];
  const remoteEvents: RemoteEvent[] = [];
  const storedContentByRemoteId = new Map<string, string>();
  const syncEvents: Record<string, unknown>[] = [];
  const adoptionBatches: EchoAdoption[][] = [];
  let localEvent: MaterializedSyncableEvent = {
    calendarId: "source-calendar",
    calendarName: "Source",
    calendarUrl: null,
    description: "Original body",
    endTime: END,
    eventStateId: "event-state-1",
    id: "event-state-1",
    sourceEventUid: "source-uid",
    startTime: START,
    summary: "Standup",
  };
  let nextRemoteId = 0;

  const listedRemoteEvents = (): RemoteEvent[] =>
    remoteEvents.map((remote) => options.listRewrite?.(remote) ?? remote);

  const provider: CalendarSyncProvider = {
    deleteEvents: (eventIds) => {
      for (const eventId of eventIds) {
        const index = remoteEvents.findIndex((remote) => remote.deleteId === eventId);
        if (index !== -1) {
          remoteEvents.splice(index, 1);
        }
        storedContentByRemoteId.delete(eventId);
      }
      return Promise.resolve(eventIds.map(() => ({ success: true })));
    },
    listRemoteEvents: () => Promise.resolve(listedRemoteEvents()),
    pushEvents: (events) => Promise.resolve(events.map((event) => {
      const remoteId = `remote-${nextRemoteId}`;
      nextRemoteId += 1;
      const stored = storeLossily(event);
      storedContentByRemoteId.set(remoteId, stored.description ?? "");
      remoteEvents.push({
        deleteId: remoteId,
        editableAvailability: "busy",
        editableContentHash: createEditableEventContentHash(stored),
        endTime: stored.endTime,
        isKeeperEvent: true,
        startTime: stored.startTime,
        supportedAvailabilities: ["busy", "free"],
        uid: remoteId,
      });
      return {
        deleteId: remoteId,
        editableContentHash: createEditableEventContentHash(stored),
        remoteId,
        success: true,
      };
    })),
  };

  const flush = (changes: PendingChanges): Promise<void> => {
    for (const deleted of changes.deletes) {
      const index = mappings.findIndex((mapping) => mapping.id === deleted);
      if (index !== -1) {
        mappings.splice(index, 1);
      }
    }
    for (const insert of changes.inserts) {
      mappings.push({
        calendarId: insert.calendarId,
        deleteIdentifier: insert.deleteIdentifier,
        destinationEventUid: insert.destinationEventUid,
        endTime: insert.endTime,
        eventStateId: insert.eventStateId,
        id: `mapping-${nextRemoteId}-${mappings.length}`,
        remoteContentHash: insert.remoteContentHash,
        remoteEchoAlgorithm: resolveEchoAlgorithm(insert),
        remoteEchoAt: null,
        remoteRejectedContentHash: insert.remoteRejectedContentHash,
        sourceCalendarId: insert.sourceCalendarId,
        startTime: insert.startTime,
        syncEventHash: insert.syncEventHash,
        syncEventId: insert.syncEventId,
      });
    }
    for (const update of changes.updates ?? []) {
      const mapping = mappings.find((candidate) => candidate.id === update.id);
      if (mapping) {
        mapping.deleteIdentifier = update.deleteIdentifier;
        mapping.syncEventHash = update.syncEventHash;
        mapping.syncEventId = update.syncEventId;
      }
    }
    return Promise.resolve();
  };

  const adoptEchoes = (adoptions: EchoAdoption[], recordedAt: Date): Promise<void> => {
    if (options.failAdoption) {
      return Promise.reject(new Error("adoption write failed"));
    }
    adoptionBatches.push(adoptions);
    for (const adoption of adoptions) {
      const mapping = mappings.find((candidate) => candidate.id === adoption.mappingId);
      if (mapping) {
        mapping.remoteContentHash = adoption.contentHash;
        mapping.remoteEchoAlgorithm = EDITABLE_CONTENT_ECHO_ALGORITHM;
        mapping.remoteEchoAt = recordedAt;
        mapping.remoteRejectedContentHash = null;
      }
    }
    return Promise.resolve();
  };

  const runSync = () => syncCalendar({
    adoptEchoes,
    calendarId: DESTINATION_CALENDAR_ID,
    echoConfig: {
      adoptionEnabled: options.adoptionEnabled ?? true,
      maxAdoptionsPerRun: 2000,
      mode: options.mode ?? "on",
    },
    flush,
    isCurrent: () => Promise.resolve(true),
    onSyncEvent: (event) => syncEvents.push(event),
    provider,
    readState: () => Promise.resolve({
      existingMappings: [...mappings],
      localEvents: [localEvent],
      remoteEvents: listedRemoteEvents(),
    }),
    reconciliationScope: TEST_RECONCILIATION_SCOPE,
    userId: "user-1",
  });

  return {
    adoptionBatches,
    editSource: (summary: string) => {
      localEvent = { ...localEvent, summary };
    },
    mappings,
    remoteEvents,
    runSync,
    storedContentByRemoteId,
    syncEvents,
  };
};

describe("syncCalendar destination echo", () => {
  it("stops replacing a mirror the destination rewrites on every read", async () => {
    const harness = createHarness();

    const first = await harness.runSync();
    expect(first.added).toBe(1);
    expect(harness.remoteEvents).toHaveLength(1);

    const second = await harness.runSync();
    expect(second.added).toBe(0);
    expect(second.removed).toBe(0);
    expect(harness.adoptionBatches.at(-1)).toHaveLength(1);

    const third = await harness.runSync();
    expect(third.added).toBe(0);
    expect(third.removed).toBe(0);

    const fourth = await harness.runSync();
    expect(fourth.added).toBe(0);
    expect(fourth.removed).toBe(0);
    expect(harness.remoteEvents[0]?.uid).toBe("remote-0");
  });

  /*
   * A destination whose write response and listing render the same stored copy
   * differently cannot be told from a guest edit on the first read-back, so it costs one
   * correction -- and then the read-back that survived that push identifies itself.
   */
  it("settles after one correction when the listing contradicts the write response", async () => {
    const harness = createHarness({
      listRewrite: (remote) => ({
        ...remote,
        editableContentHash: createEditableEventContentHash({
          description: "Listed differently",
          summary: "Standup",
        }),
      }),
    });

    const first = await harness.runSync();
    const second = await harness.runSync();
    const third = await harness.runSync();
    const fourth = await harness.runSync();

    expect(first.added).toBe(1);
    expect(second.added).toBe(1);
    expect(third.added).toBe(0);
    expect(fourth.added).toBe(0);
    expect(harness.remoteEvents).toHaveLength(1);
  });

  it("keeps replacing the same mirror forever with the comparison off", async () => {
    const harness = createHarness({ mode: "off" });

    await harness.runSync();
    const second = await harness.runSync();
    const third = await harness.runSync();

    expect(second.added).toBe(1);
    expect(third.added).toBe(1);
  });

  it("still propagates a real source edit to the mirror once the echo is adopted", async () => {
    const harness = createHarness();

    await harness.runSync();
    await harness.runSync();
    expect(harness.adoptionBatches.at(-1)).toHaveLength(1);

    harness.editSource("Standup, renamed");
    const result = await harness.runSync();

    expect(result.added).toBe(1);
    expect(harness.remoteEvents).toHaveLength(1);
    const remoteId = harness.remoteEvents[0]?.uid ?? "";
    expect(harness.remoteEvents[0]?.editableContentHash).toBe(
      createEditableEventContentHash({
        description: harness.storedContentByRemoteId.get(remoteId),
        summary: "Standup, renamed",
      }),
    );
  });

  it("emits every echo field on the wide event including zeros", async () => {
    const harness = createHarness();

    await harness.runSync();
    const [wideEvent] = harness.syncEvents;

    expect(wideEvent).toBeDefined();
    const echoFields = Object.fromEntries(
      Object.entries(wideEvent ?? {}).filter(([key]) => key.startsWith("echo.")),
    );

    expect(echoFields).toEqual({
      "echo.adopted_count": 0,
      "echo.adoption_local_divergence_count": 0,
      "echo.availability_changed_count": 0,
      "echo.avoided_availability_changed_count": 0,
      "echo.avoided_content_changed_count": 0,
      "echo.avoided_time_changed_count": 0,
      "echo.content_changed_count": 0,
      "echo.eligible_count": 0,
      "echo.legacy_availability_changed_count": 0,
      "echo.legacy_content_changed_count": 0,
      "echo.legacy_time_changed_count": 0,
      "echo.missing_count": 0,
      "echo.mode": "on",
      "echo.time_changed_count": 0,
      "echo.unconfirmed_count": 0,
      "echo.unreadable_count": 0,
    });
  });

  it("records no observation when adoption is switched off", async () => {
    const harness = createHarness({ adoptionEnabled: false });

    await harness.runSync();
    await harness.runSync();

    expect(harness.adoptionBatches).toHaveLength(0);
    expect(harness.syncEvents.at(-1)).toMatchObject({
      "echo.adopted_count": 0,
      "echo.eligible_count": 1,
      "echo.missing_count": 0,
      "echo.unconfirmed_count": 1,
    });
  });

  it("keeps the run successful when the observation write fails", async () => {
    const harness = createHarness({ failAdoption: true });

    await harness.runSync();
    const second = await harness.runSync();

    expect(second.errors).toEqual([]);
    expect(harness.syncEvents.at(-1)).toMatchObject({
      "echo.adopted_count": 0,
      "echo.adoption_error": "adoption write failed",
      "echo.adoption_failed": true,
    });
  });
});
