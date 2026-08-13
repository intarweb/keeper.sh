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
import { serializeRemoteStateEcho } from "../../../src/core/events/remote-echo";
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
  availability: "busy" | "free";
  startTime: Date;
  endTime: Date;
}

type Rewrite = (stored: StoredRemote, writeCount: number) => StoredRemote;

const identityRewrite: Rewrite = (stored) => stored;

const toStoredAvailability = (
  availability: MaterializedSyncableEvent["availability"],
): "busy" | "free" => {
  if (availability === "free") {
    return "free";
  }
  return "busy";
};

const editableHashOf = (stored: StoredRemote): string =>
  createEditableEventContentHash({
    availability: stored.availability,
    description: stored.description,
    endTime: stored.endTime,
    location: stored.location,
    startTime: stored.startTime,
    summary: stored.summary,
  });

const echoOf = (stored: StoredRemote): string =>
  serializeRemoteStateEcho({
    availability: stored.availability,
    contentHash: editableHashOf(stored),
    endTime: stored.endTime,
    startTime: stored.startTime,
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

interface HarnessOptions {
  /*
   * What the provider's write response claims it stored. Defaults to the value the
   * provider actually ends up storing; a provider that normalizes asynchronously
   * echoes back exactly what it was sent and only diverges on a later read.
   */
  writeEcho?: (requested: StoredRemote, stored: StoredRemote) => StoredRemote;
  writeEchoAbsent?: boolean;
  listRewrite?: (stored: StoredRemote, listCount: number) => StoredRemote;
  rewrite?: Rewrite;
}

class Harness {
  public readonly stats: RunStats[] = [];
  public providerWrites = 0;
  public providerDeletes = 0;
  public adoptionsApplied = 0;
  public adoptionWritesLand = true;
  private remote = new Map<string, StoredRemote>();
  private mappings: EventMapping[] = [];
  private nextId = 1;
  private listCount = 0;

  private readonly local: MaterializedSyncableEvent[];
  private readonly options: HarnessOptions;

  constructor(local: MaterializedSyncableEvent[], options: HarnessOptions = {}) {
    this.local = local;
    this.options = options;
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

  private listRemote(): RemoteEvent[] {
    this.listCount += 1;
    return [...this.remote.values()].map((stored) => {
      const listed = this.options.listRewrite?.(stored, this.listCount) ?? stored;
      return {
        deleteId: listed.deleteId,
        editableAvailability: listed.availability,
        editableContentHash: editableHashOf(listed),
        endTime: listed.endTime,
        isKeeperEvent: true,
        startTime: listed.startTime,
        supportedAvailabilities: ["busy" as const, "free" as const],
        uid: listed.uid,
      };
    });
  }

  private write(event: MaterializedSyncableEvent): { echo: string | null; stored: StoredRemote } {
    this.providerWrites += 1;
    const uid = `remote-${this.nextId}`;
    this.nextId += 1;
    const requested: StoredRemote = {
      availability: toStoredAvailability(event.availability),
      deleteId: uid,
      description: event.description,
      endTime: event.endTime,
      location: event.location,
      startTime: event.startTime,
      summary: event.summary,
      uid,
    };
    const rewrite = this.options.rewrite ?? identityRewrite;
    const stored = { ...rewrite(requested, this.providerWrites), deleteId: uid, uid };
    this.remote.set(uid, stored);
    if (this.options.writeEchoAbsent) {
      return { echo: null, stored };
    }
    const echoed = this.options.writeEcho?.(requested, stored) ?? stored;
    return { echo: echoOf(echoed), stored };
  }

  public run(
    mode: EchoComparisonMode = "on",
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
        this.mappings = this.mappings.filter(
          (candidate) => candidate.id !== operation.staleMappingId,
        );
        this.insertMapping(operation.event, operation.rejectedContentHash ?? null);
        continue;
      }
      stats.adds += 1;
      if (operation.staleMappingId) {
        this.mappings = this.mappings.filter(
          (candidate) => candidate.id !== operation.staleMappingId,
        );
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
        return {
          ...candidate,
          deleteIdentifier: update.deleteIdentifier,
          syncEventHash: update.syncEventHash,
          syncEventId: update.syncEventId,
          ...(update.remoteEcho && {
            remoteContentHash: update.remoteEcho.contentHash,
            remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
            remoteEchoAt: now,
            remoteRejectedContentHash: null,
          }),
        };
      });
    }

    this.applyAdoptions(result.adoptionIntents, now);
    this.stats.push(stats);
    return { adoptions: result.adoptionIntents, echoCounts: result.echoCounts, stats };
  }

  private applyAdoptions(adoptions: EchoAdoption[], now: Date): void {
    if (!this.adoptionWritesLand) {
      return;
    }
    const byId = new Map(adoptions.map((adoption) => [adoption.mappingId, adoption.contentHash]));
    this.mappings = this.mappings.map((mapping) => {
      const hash = byId.get(mapping.id);
      if (!hash) {
        return mapping;
      }
      this.adoptionsApplied += 1;
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
    const { echo, stored } = this.write(event);
    this.mappings.push({
      calendarId: "destination-calendar-id",
      deleteIdentifier: stored.deleteId,
      destinationEventUid: stored.uid,
      endTime: event.endTime,
      eventStateId: event.eventStateId ?? event.id,
      id: `mapping-${this.nextId}`,
      remoteContentHash: echo,
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
  summary: "Weekly planning sync",
  ...overrides,
});

const firstRemoteUid = (harness: Harness): string => {
  const [uid] = harness.remoteUids;
  if (!uid) {
    throw new Error("no remote event");
  }
  return uid;
};

const truncateSummary: Rewrite = (stored) => ({
  ...stored,
  summary: stored.summary.slice(0, 5),
});

describe("provider echoes what it was sent and normalizes afterwards", () => {
  it("settles after one correction when the write response is not yet normalized", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: truncateSummary,
      writeEcho: (requested) => requested,
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });

  it("settles when the write response is unusable entirely", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: truncateSummary,
      writeEchoAbsent: true,
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });
});

describe("provider rewrites dimensions other than editable content", () => {
  it("settles when the destination stores a slightly different start time", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({
        ...stored,
        endTime: new Date(stored.endTime.getTime() + 30_000),
        startTime: new Date(stored.startTime.getTime() + 30_000),
      }),
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });

  it("settles when the destination stores a different availability", () => {
    const harness = new Harness([createLocalEvent({ availability: "free" })], {
      rewrite: (stored) => ({ ...stored, availability: "busy" }),
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });
});

describe("provider alternates between two renderings", () => {
  it("stops rewriting a mirror it renders two ways", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${" ".repeat(listCount % 2)}`,
      }),
    });
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBeLessThanOrEqual(3);
  });
});

describe("genuine changes still propagate once an echo is confirmed", () => {
  it("repairs a destination edit made after the echo has settled", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: truncateSummary });
    harness.run("on");
    harness.run("on");
    harness.run("on");
    const writesBefore = harness.providerWrites;
    expect(writesBefore).toBe(1);

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked by a guest" });
    harness.run("on");
    expect(harness.providerWrites).toBe(writesBefore + 1);
  });

  it("accepts a rejected read-back reproduced on the first read-back after the push, and settles there", () => {
    const harness = new Harness([createLocalEvent()], {
      writeEcho: (requested) => requested,
    });
    harness.run("on");
    const uid = firstRemoteUid(harness);
    harness.mutateRemote(uid, { summary: "Guest rewrote this" });
    harness.run("on");
    const writesAfterFirstRepair = harness.providerWrites;
    expect(writesAfterFirstRepair).toBe(2);

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(writesAfterFirstRepair);
  });
});

describe("recurring occurrences re-materialized against a lossy destination", () => {
  const seriesEvent = (id: string): MaterializedSyncableEvent => createLocalEvent({
    eventStateId: "series-1",
    id,
  });

  it("remaps in the database rather than rewriting when the provider is lossless", () => {
    const harness = new Harness([seriesEvent("occurrence-a")]);
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    harness.setLocal([seriesEvent("occurrence-b")]);
    harness.run("on");
    expect(harness.providerWrites).toBe(1);
    expect(harness.providerDeletes).toBe(0);
  });

  it("remaps in the database rather than rewriting when the provider is lossy", () => {
    const harness = new Harness([seriesEvent("occurrence-a")], { rewrite: truncateSummary });
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    harness.setLocal([seriesEvent("occurrence-b")]);
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);
    expect(harness.providerDeletes).toBe(0);
  });
});

describe("rejected read-back retained when adoption is disabled", () => {
  it("stops accepting the rejected read-back after the run that follows the repair", () => {
    const harness = new Harness([createLocalEvent()], {
      writeEcho: (requested) => requested,
    });
    harness.adoptionWritesLand = false;
    harness.run("on");
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    harness.run("on");
    expect(harness.providerWrites).toBe(2);

    harness.run("on");
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    harness.run("on");
    expect(harness.providerWrites).toBe(3);
  });
});

describe("adoption writes that never land", () => {
  it("does not churn when every adoption write is lost", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: truncateSummary });
    harness.adoptionWritesLand = false;
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(1);
  });

  it("still repairs a destination edit when every adoption write is lost", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: truncateSummary });
    harness.adoptionWritesLand = false;
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked by a guest" });
    harness.run("on");
    expect(harness.providerWrites).toBe(2);
  });
});

describe("shadow mode measures the churning population", () => {
  it("counts the replaces the on mode would have avoided", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: truncateSummary });
    let avoided = 0;
    let replaces = 0;
    for (let run = 0; run < 4; run += 1) {
      const result = harness.run("shadow");
      avoided += result.echoCounts.avoidedContentChangedCount;
      replaces += result.stats.replaces;
    }
    expect(replaces).toBeGreaterThan(0);
    expect(avoided).toBeGreaterThan(0);
  });
});

describe("occurrence reassignment cost against a lossy destination", () => {
  it("does not delete and recreate the mirror to remap an occurrence id", () => {
    const harness = new Harness(
      [createLocalEvent({ eventStateId: "series-1", id: "occurrence-a" })],
      { rewrite: truncateSummary },
    );
    harness.run("on");
    harness.run("on");
    const deletesBefore = harness.providerDeletes;
    harness.setLocal([createLocalEvent({ eventStateId: "series-1", id: "occurrence-b" })]);
    harness.run("on");
    expect(harness.providerDeletes).toBe(deletesBefore);
  });
});
