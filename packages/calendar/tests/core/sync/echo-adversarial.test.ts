import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type {
  EchoAdoption,
  EchoComparisonMode,
  EchoCounts,
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
} from "../../../src/core/types";

const TEST_WINDOW = {
  timeMax: new Date("2030-01-01T00:00:00.000Z"),
  timeMin: new Date("2020-01-01T00:00:00.000Z"),
};

const SCOPE: ReconciliationScope = {
  authoritativeWindow: TEST_WINDOW,
  requestedWindow: TEST_WINDOW,
};

interface StoredRemote {
  uid: string;
  deleteId: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
}

type Rewrite = (stored: StoredRemote, writeCount: number) => StoredRemote;

const identityRewrite: Rewrite = (stored) => stored;

const editableHashOf = (stored: StoredRemote): string =>
  createEditableEventContentHash({
    description: stored.description,
    location: stored.location,
    summary: stored.summary,
  });

interface RunStats {
  adds: number;
  removes: number;
  replaces: number;
}

interface RunResult {
  adoptions: EchoAdoption[];
  echoCounts: EchoCounts;
  stats: RunStats;
}

/*
 * A destination double plus a mapping store, driven by whatever computeSyncOperations
 * decides. Every provider write goes through `rewrite`, which is how a lossy provider
 * is simulated.
 */
class Harness {
  public readonly stats: RunStats[] = [];
  public providerWrites = 0;
  public providerDeletes = 0;
  private remote = new Map<string, StoredRemote>();
  private mappings: EventMapping[] = [];
  private nextId = 1;

  private readonly local: MaterializedSyncableEvent[];
  private readonly rewrite: Rewrite;
  private readonly listRewrite: (stored: StoredRemote) => StoredRemote;

  constructor(
    local: MaterializedSyncableEvent[],
    rewrite: Rewrite = identityRewrite,
    listRewrite: (stored: StoredRemote) => StoredRemote = (value) => value,
  ) {
    this.local = local;
    this.rewrite = rewrite;
    this.listRewrite = listRewrite;
  }

  public get remoteUids(): string[] {
    return [...this.remote.keys()].toSorted();
  }

  public get mappingRows(): EventMapping[] {
    return this.mappings;
  }

  public setLocal(events: MaterializedSyncableEvent[]): void {
    this.local.length = 0;
    this.local.push(...events);
  }

  public mutateRemote(uid: string, patch: Partial<StoredRemote>): void {
    const stored = this.remote.get(uid);
    if (!stored) {
      throw new Error(`no remote event ${uid}`);
    }
    this.remote.set(uid, { ...stored, ...patch });
  }

  public dropAllMappings(): void {
    this.mappings = [];
  }

  public deleteRemote(uid: string): void {
    this.remote.delete(uid);
  }

  private listRemote(): RemoteEvent[] {
    return [...this.remote.values()].map((stored) => {
      const listed = this.listRewrite(stored);
      return {
        deleteId: listed.deleteId,
        editableAvailability: "busy" as const,
        editableContentHash: createEditableEventContentHash({
          description: listed.description,
          location: listed.location,
          summary: listed.summary,
        }),
        endTime: listed.endTime,
        isKeeperEvent: true,
        startTime: listed.startTime,
        supportedAvailabilities: ["busy" as const, "free" as const],
        uid: listed.uid,
      };
    });
  }

  private write(event: MaterializedSyncableEvent): StoredRemote {
    this.providerWrites += 1;
    const uid = `remote-${this.nextId}`;
    this.nextId += 1;
    const requested: StoredRemote = {
      deleteId: uid,
      description: event.description,
      endTime: event.endTime,
      location: event.location,
      startTime: event.startTime,
      summary: event.summary,
      uid,
    };
    const stored = { ...this.rewrite(requested, this.providerWrites), deleteId: uid, uid };
    this.remote.set(uid, stored);
    return stored;
  }

  public run(
    mode: EchoComparisonMode,
    options: Partial<EchoReconciliationOptions> = {},
    now = new Date("2026-03-01T00:00:00.000Z"),
  ): RunResult {
    const echoOptions: EchoReconciliationOptions = {
      maxAdoptionsPerRun: 2000,
      mode,
      ...options,
    };
    const result = computeSyncOperations(
      this.local,
      this.mappings,
      this.listRemote(),
      SCOPE,
      echoOptions,
    );

    const stats: RunStats = { adds: 0, removes: 0, replaces: 0 };
    for (const operation of result.operations) {
      if (operation.type === "remove") {
        stats.removes += 1;
        this.providerDeletes += 1;
        this.remote.delete(operation.uid);
        continue;
      }
      if (operation.type === "replace") {
        stats.replaces += 1;
        this.providerDeletes += 1;
        this.remote.delete(operation.uid);
        this.mappings = this.mappings.filter((candidate) => candidate.id !== operation.staleMappingId);
        this.insertMapping(operation.event, operation.rejectedContentHash ?? null);
        continue;
      }
      stats.adds += 1;
      if (operation.staleMappingId) {
        this.mappings = this.mappings.filter((candidate) => candidate.id !== operation.staleMappingId);
      }
      this.insertMapping(operation.event, operation.rejectedContentHash ?? null);
    }

    for (const staleId of result.staleMappingIds) {
      this.mappings = this.mappings.filter((candidate) => candidate.id !== staleId);
    }
    for (const update of result.mappingUpdates) {
      this.mappings = this.mappings.map((candidate) => {
        if (candidate.id !== update.id) {
          return candidate;
        }
        return { ...candidate, deleteIdentifier: update.deleteIdentifier };
      });
    }

    this.applyAdoptions(result.adoptionIntents, now);
    this.stats.push(stats);
    return { adoptions: result.adoptionIntents, echoCounts: result.echoCounts, stats };
  }

  private applyAdoptions(adoptions: EchoAdoption[], now: Date): void {
    const byId = new Map(adoptions.map((adoption) => [adoption.mappingId, adoption.contentHash]));
    this.mappings = this.mappings.map((mapping) => {
      const hash = byId.get(mapping.id);
      if (!hash) {
        return mapping;
      }
      return {
        ...mapping,
        remoteContentHash: hash,
        remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
        remoteEchoAt: now,
        remoteRejectedContentHash: null,
      };
    });
  }

  private insertMapping(
    event: MaterializedSyncableEvent,
    rejectedContentHash: string | null,
  ): void {
    const stored = this.write(event);
    this.mappings.push({
      calendarId: "destination-calendar-id",
      deleteIdentifier: stored.deleteId,
      destinationEventUid: stored.uid,
      endTime: event.endTime,
      eventStateId: event.id,
      id: `mapping-${this.nextId}`,
      remoteContentHash: editableHashOf(stored),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteEchoAt: null,
      remoteRejectedContentHash: rejectedContentHash,
      sourceCalendarId: "source-calendar-id",
      startTime: event.startTime,
      syncEventHash: createSyncEventContentHash(event),
      syncEventId: event.id,
    });
    this.nextId += 1;
  }
}

const createLocalEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-1",
  sourceEventUid: "source-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Meeting",
  ...overrides,
});

const nthRemoteUid = (harness: Harness, index: number): string => {
  const uid = harness.remoteUids[index];
  if (!uid) {
    throw new Error(`no remote event at index ${index}`);
  }
  return uid;
};

const firstRemoteUid = (harness: Harness): string => nthRemoteUid(harness, 0);

const nondeterministicRewrite: Rewrite = (stored, count) => ({
  ...stored,
  summary: `${stored.summary}-${count}`,
});

const truncateSummary: Rewrite = (stored) => ({
  ...stored,
  summary: stored.summary.slice(0, 5),
});

describe("echo convergence under a lossy destination", () => {
  it("settles after at most one correction with a deterministic rewrite", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(1);
    expect(harness.providerDeletes).toBe(0);
    expect(harness.remoteUids).toHaveLength(1);
  });

  it("legacy mode churns forever against the same rewrite", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    for (let run = 0; run < 10; run += 1) {
      harness.run("off");
    }
    expect(harness.providerWrites).toBeGreaterThan(5);
  });

  it("shadow mode churns like legacy while still recording echoes", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    for (let run = 0; run < 6; run += 1) {
      harness.run("shadow");
    }
    expect(harness.providerWrites).toBeGreaterThan(3);
  });

  it("bounds the damage from a provider that rewrites differently every write", () => {
    const harness = new Harness([createLocalEvent()], nondeterministicRewrite);
    for (let run = 0; run < 12; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThan(12);
  });

  /*
   * A destination whose write response and read-back render the same stored copy
   * differently is indistinguishable from a guest edit on the first read-back, so it
   * costs one correction; the read-back that survives that fresh push identifies itself
   * as the destination's own rendering and is accepted.
   */
  it("settles after one correction when the provider lists a form it did not echo", () => {
    const harness = new Harness(
      [createLocalEvent()],
      identityRewrite,
      (stored) => ({ ...stored, summary: stored.summary.toUpperCase() }),
    );
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(2);
    expect(harness.remoteUids).toHaveLength(1);
  });

  it("stops growing writes across many mirrors", () => {
    const events = Array.from({ length: 50 }, (unused, index) =>
      createLocalEvent({
        endTime: new Date(`2026-03-08T${String(index % 12 + 1).padStart(2, "0")}:30:00.000Z`),
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        startTime: new Date(`2026-03-08T${String(index % 12 + 1).padStart(2, "0")}:00:00.000Z`),
        summary: `Meeting number ${index}`,
      }));
    const harness = new Harness(events, truncateSummary);
    harness.run("on");
    const afterFirst = harness.providerWrites;
    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(afterFirst).toBe(50);
    expect(harness.providerWrites).toBe(50);
  });
});

describe("shadow mode observability", () => {
  /*
   * The churning population never reaches an adoption, because every run replaces the
   * row an adoption would target. What shadow mode owes an operator is the counterfactual
   * -- how many of these replaces the echo verdict would have withheld -- and it must be
   * non-zero for exactly the mappings that are churning.
   */
  it("measures the churning population it exists to measure", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    const first = harness.run("shadow");
    const second = harness.run("shadow");
    const third = harness.run("shadow");
    expect(first.stats.replaces + second.stats.replaces + third.stats.replaces)
      .toBeGreaterThan(0);
    const avoidable = first.echoCounts.avoidedContentChangedCount
      + second.echoCounts.avoidedContentChangedCount
      + third.echoCounts.avoidedContentChangedCount;
    const measured = first.echoCounts.legacyContentChangedCount
      + second.echoCounts.legacyContentChangedCount
      + third.echoCounts.legacyContentChangedCount;
    expect(measured).toBeGreaterThan(0);
    expect(avoidable).toBe(measured);
  });
});

describe("repair and convergence are not traded against each other", () => {
  it("repairs a destination edit made before any read-back confirmed the echo", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on");
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked by the user" });
    const baseline = harness.providerWrites;
    harness.run("on");
    expect(harness.providerWrites).toBe(baseline + 1);
  });

  it("and under the same settings never churns against a lossy provider", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(1);
  });
});

describe("no lost updates", () => {
  it("propagates a genuine local change after the echo has settled", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    harness.run("on");
    harness.run("on");
    const baseline = harness.providerWrites;

    harness.setLocal([createLocalEvent({ summary: "Renamed meeting" })]);
    harness.run("on");
    expect(harness.providerWrites).toBe(baseline + 1);

    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(baseline + 1);
  });

  it("repairs a direct edit made on the destination once the echo is settled", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on");
    harness.run("on");
    const baseline = harness.providerWrites;

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked by the user" });
    harness.run("on");
    expect(harness.providerWrites).toBe(baseline + 1);
  });

  it("repairs a direct edit made on the destination before any echo exists", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on");
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked by the user" });
    const baseline = harness.providerWrites;
    harness.run("on");
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(baseline + 1);
  });

  it("recreates an event the destination deleted", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on");
    harness.run("on");
    const baseline = harness.providerWrites;
    harness.deleteRemote(firstRemoteUid(harness));
    harness.run("on");
    expect(harness.providerWrites).toBe(baseline + 1);
    expect(harness.remoteUids).toHaveLength(1);
  });

  it("removes the mirror when the source event disappears", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    harness.run("on");
    harness.run("on");
    harness.setLocal([]);
    harness.run("on");
    expect(harness.remoteUids).toHaveLength(0);
  });

  it("propagates a local time change even while the echo is fresh", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    harness.run("on");
    harness.run("on");
    const baseline = harness.providerWrites;
    harness.setLocal([createLocalEvent({
      endTime: new Date("2026-03-08T17:00:00.000Z"),
      startTime: new Date("2026-03-08T16:00:00.000Z"),
    })]);
    harness.run("on");
    expect(harness.providerWrites).toBe(baseline + 1);
  });
});

describe("no data loss or duplication", () => {
  it("keeps exactly one mirror per source event across a long run", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
  });

  it("does not duplicate when the adoption write is lost every run", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    for (let run = 0; run < 8; run += 1) {
      harness.run("on", { maxAdoptionsPerRun: 1 });
    }
    expect(harness.remoteUids).toHaveLength(1);
  });

  it("recovers to exactly one mirror when the mapping write is lost after the push", () => {
    const harness = new Harness([createLocalEvent()], truncateSummary);
    harness.run("on");
    harness.dropAllMappings();
    for (let run = 0; run < 6; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
  });

  it("degrades to legacy behaviour, not lost updates, when echoes vanish", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on");
    harness.run("on");
    for (const mapping of harness.mappingRows) {
      mapping.remoteContentHash = null;
      mapping.remoteEchoAlgorithm = null;
      mapping.remoteEchoAt = null;
    }
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked" });
    const baseline = harness.providerWrites;
    for (let run = 0; run < 4; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBeGreaterThan(baseline);
  });
});

describe("day one", () => {
  it("neither mass-replaces nor mass-skips when every echo column is empty", () => {
    const events = Array.from({ length: 30 }, (unused, index) =>
      createLocalEvent({
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        summary: `Meeting number ${index}`,
      }));
    const harness = new Harness(events, truncateSummary);
    harness.run("off");
    const afterSeed = harness.providerWrites;
    expect(afterSeed).toBe(30);

    const firstEchoRun = harness.run("on");
    expect(firstEchoRun.stats.replaces).toBe(0);
    expect(firstEchoRun.adoptions).toHaveLength(30);

    for (let run = 0; run < 5; run += 1) {
      const { stats } = harness.run("on");
      expect(stats.replaces).toBe(0);
      expect(stats.adds).toBe(0);
      expect(stats.removes).toBe(0);
    }
  });

  it("still detects a destination edit on the very first echo run", () => {
    const events = Array.from({ length: 10 }, (unused, index) =>
      createLocalEvent({
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        summary: `Meeting number ${index}`,
      }));
    const harness = new Harness(events);
    harness.run("off");
    harness.mutateRemote(nthRemoteUid(harness, 3), { summary: "Hijacked" });
    const firstEchoRun = harness.run("on");
    expect(firstEchoRun.stats.replaces).toBe(1);
  });

  it("does not adopt a destination divergence that exists when the echo is absent", () => {
    const localEvent = createLocalEvent();
    const mapping: EventMapping = {
      calendarId: "destination-calendar-id",
      deleteIdentifier: "remote-1",
      destinationEventUid: "remote-1",
      endTime: localEvent.endTime,
      eventStateId: localEvent.id,
      id: "mapping-1",
      remoteContentHash: null,
      remoteEchoAlgorithm: null,
      remoteEchoAt: null,
      remoteRejectedContentHash: null,
      sourceCalendarId: "source-calendar-id",
      startTime: localEvent.startTime,
      syncEventHash: createSyncEventContentHash(localEvent),
      syncEventId: localEvent.id,
    };
    const divergentRemote: RemoteEvent = {
      deleteId: "remote-1",
      editableAvailability: "busy",
      editableContentHash: createEditableEventContentHash({ summary: "Hijacked" }),
      endTime: localEvent.endTime,
      isKeeperEvent: true,
      startTime: localEvent.startTime,
      supportedAvailabilities: ["busy", "free"],
      uid: "remote-1",
    };
    const echoOptions: EchoReconciliationOptions = {
      maxAdoptionsPerRun: 2000,
      mode: "on",
    };

    const { adoptionIntents, echoCounts, operations } = computeSyncOperations(
      [localEvent],
      [mapping],
      [divergentRemote],
      SCOPE,
      echoOptions,
    );

    expect(echoCounts.legacyContentChangedCount).toBe(1);
    expect(operations.filter((operation) => operation.type === "replace"))
      .toHaveLength(1);
    expect(adoptionIntents).toHaveLength(0);
  });

  it("does not let a stale echo strand a mapping forever", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on", {}, new Date("2026-03-01T00:00:00.000Z"));
    harness.run("on", {}, new Date("2026-03-01T00:05:00.000Z"));
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked" });
    const baseline = harness.providerWrites;
    for (let run = 0; run < 4; run += 1) {
      harness.run("on", {}, new Date("2026-03-20T00:00:00.000Z"));
    }
    expect(harness.providerWrites).toBe(baseline + 1);
  });
});
