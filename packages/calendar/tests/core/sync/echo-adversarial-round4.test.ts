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
  public pushFails = false;
  public failedWrites = 0;
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

  public get remoteEvents(): StoredRemote[] {
    return [...this.remote.values()];
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

  public dropRemote(uid: string): void {
    this.remote.delete(uid);
  }

  /* Every mapping as it stands the moment the column ships: no echo, no algorithm. */
  public clearEchoes(): void {
    this.mappings = this.mappings.map((mapping) => ({
      ...mapping,
      remoteContentHash: null,
      remoteEchoAlgorithm: null,
      remoteEchoAt: null,
      remoteRejectedContentHash: null,
    }));
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
        /*
         * The engine deletes the mapping row the moment the remote delete succeeds, so a
         * push that fails afterwards leaves neither a mirror nor a row behind.
         */
        this.mappings = this.mappings.filter(
          (candidate) => candidate.id !== operation.staleMappingId,
        );
        if (this.pushFails) {
          this.failedWrites += 1;
          continue;
        }
        this.insertMapping(operation.event, operation.rejectedContentHash ?? null);
        continue;
      }
      stats.adds += 1;
      if (this.pushFails) {
        this.failedWrites += 1;
        continue;
      }
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

const echoWhatWasSent = (requested: StoredRemote): StoredRemote => requested;

const shiftStoredTimes = (seconds: number): Rewrite => (stored) => ({
  ...stored,
  endTime: new Date(stored.endTime.getTime() + seconds * 1000),
  startTime: new Date(stored.startTime.getTime() + seconds * 1000),
});

const rewriteEveryDimension: Rewrite = (stored) => ({
  ...stored,
  availability: "busy",
  endTime: new Date(stored.endTime.getTime() + 30_000),
  location: "",
  startTime: new Date(stored.startTime.getTime() + 30_000),
  summary: stored.summary.trimEnd().slice(0, 6),
});

const totalWrites = (harness: Harness): number => harness.providerWrites + harness.failedWrites;

/*
 * Rounds 1 to 3 exercised one rewritten dimension at a time. A real destination coerces
 * whatever it dislikes in the same store, so these drive every dimension at once.
 */
describe("a destination that rewrites every dimension at once", () => {
  it("settles after one correction when the write response already shows the rewrite", () => {
    const harness = new Harness([createLocalEvent({
      availability: "free",
      location: "Room 4",
      summary: "Weekly planning sync with the whole team",
    })], { rewrite: rewriteEveryDimension });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
    expect(harness.providerWrites).toBe(1);
    expect(harness.providerDeletes).toBe(0);
  });

  it("settles after one correction when the rewrite only appears on a later read", () => {
    const harness = new Harness([createLocalEvent({
      availability: "free",
      location: "Room 4",
      summary: "Weekly planning sync with the whole team",
    })], { rewrite: rewriteEveryDimension, writeEcho: echoWhatWasSent });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });

  it("settles when the write response and the read-back disagree about the rewrite", () => {
    const harness = new Harness([createLocalEvent({ location: "Room 4" })], {
      rewrite: rewriteEveryDimension,
      writeEcho: (requested) => ({
        ...requested,
        endTime: new Date(requested.endTime.getTime() + 15_000),
        startTime: new Date(requested.startTime.getTime() + 15_000),
        summary: `${requested.summary} (pending)`,
      }),
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });

  it("settles against a destination that compounds its own rewrite on every store", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: `${stored.summary}!` }),
    });
    for (let run = 0; run < 12; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBe(1);
    const [remote] = harness.remoteEvents;
    expect(remote?.summary).toBe("Weekly planning sync!");
  });
});

/*
 * A destination that rewrites while a person also edits. The rewrite must be forgiven and
 * the edit must not be, in the same run.
 */
describe("a genuine change alongside a destination rewrite", () => {
  it("repairs a guest summary edit made on a destination that also shifts the time", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    harness.run("on");
    const settledWrites = harness.providerWrites;
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Cancelled" });
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    const [remote] = harness.remoteEvents;
    expect(remote?.summary).toBe("Weekly planning sync");
  });

  it("repairs a guest reschedule made on a destination that also rewrites the summary", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
    });
    harness.run("on");
    harness.run("on");
    const settledWrites = harness.providerWrites;
    const uid = firstRemoteUid(harness);
    harness.mutateRemote(uid, {
      endTime: new Date("2026-03-08T18:00:00.000Z"),
      startTime: new Date("2026-03-08T17:00:00.000Z"),
    });
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    const [remote] = harness.remoteEvents;
    expect(remote?.startTime.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("propagates a local edit against a destination that rewrites every dimension", () => {
    const harness = new Harness([createLocalEvent({ location: "Room 4" })], {
      rewrite: rewriteEveryDimension,
    });
    harness.run("on");
    harness.run("on");
    const settledWrites = harness.providerWrites;
    harness.setLocal([createLocalEvent({ location: "Room 9", summary: "Renamed planning" })]);
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    const [remote] = harness.remoteEvents;
    expect(remote?.summary).toBe("Rename");
  });

  it("removes the mirror when the source event disappears mid-divergence", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.run("on");
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Edited by a guest" });
    harness.setLocal([]);
    const { stats } = harness.run("on");
    expect(stats.removes).toBe(1);
    expect(harness.remoteUids).toHaveLength(0);
  });
});

/* A push that fails after its remote copy is already gone must leave exactly one mirror. */
describe("a push that fails between the delete and the mapping write", () => {
  it("recovers to exactly one mirror after a failed correction", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.run("on");
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Edited by a guest" });
    harness.pushFails = true;
    harness.run("on");
    expect(harness.remoteUids).toHaveLength(0);
    expect(harness.mappingRows).toHaveLength(0);
    harness.pushFails = false;
    harness.run("on");
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
    const before = totalWrites(harness);
    harness.run("on");
    harness.run("on");
    expect(totalWrites(harness)).toBe(before);
  });

  it("does not duplicate a mirror when pushes fail on several consecutive runs", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.pushFails = true;
    for (let run = 0; run < 4; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(0);
    harness.pushFails = false;
    for (let run = 0; run < 6; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
    expect(harness.providerWrites).toBe(1);
  });
});

/* Adoption is best-effort, so losing it intermittently must cost cycles and never churn. */
describe("adoption writes that land only sometimes", () => {
  it("does not churn when every other adoption write is lost", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    for (let run = 0; run < 12; run += 1) {
      harness.adoptionWritesLand = run % 2 === 0;
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(1);
    expect(harness.remoteUids).toHaveLength(1);
  });

  it("still repairs a guest edit while adoption writes are being lost", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.adoptionWritesLand = false;
    harness.run("on");
    harness.run("on");
    const settledWrites = harness.providerWrites;
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Edited by a guest" });
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    const [remote] = harness.remoteEvents;
    expect(remote?.summary).toBe("Weekly");
  });
});

/* The observation channel is capped per run; draining it must not stall or churn. */
describe("an adoption budget smaller than the population", () => {
  const buildFleet = (count: number): MaterializedSyncableEvent[] =>
    Array.from({ length: count }, (_unused, index) => createLocalEvent({
      endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
      id: `event-state-${index}`,
      sourceEventUid: `source-uid-${index}`,
      startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
      summary: `Planning sync ${index} with the whole team`,
    }));

  it("drains a 40 mirror fleet at 5 adoptions a run without replacing anything", () => {
    const harness = new Harness(buildFleet(40), { rewrite: rewriteEveryDimension });
    harness.run("on", { maxAdoptionsPerRun: 5 });
    expect(harness.providerWrites).toBe(40);
    for (let run = 0; run < 12; run += 1) {
      const { stats } = harness.run("on", { maxAdoptionsPerRun: 5 });
      expect(stats.replaces).toBe(0);
      expect(stats.adds).toBe(0);
      expect(stats.removes).toBe(0);
    }
    expect(harness.providerWrites).toBe(40);
    expect(harness.mappingRows).toHaveLength(40);
    expect(harness.mappingRows.every((mapping) => mapping.remoteEchoAt !== null)).toBe(true);
  });

  it("still repairs a guest edit while the adoption budget is saturated", () => {
    const harness = new Harness(buildFleet(40), { rewrite: rewriteEveryDimension });
    harness.run("on", { maxAdoptionsPerRun: 5 });
    harness.run("on", { maxAdoptionsPerRun: 5 });
    const settledWrites = harness.providerWrites;
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Edited by a guest" });
    harness.run("on", { maxAdoptionsPerRun: 5 });
    expect(harness.providerWrites).toBe(settledWrites + 1);
  });
});

/*
 * Day one is the whole fleet arriving with no echo at all against a destination that
 * rewrites everything: it must cost one correction each and then go quiet.
 */
describe("day one against a destination that rewrites every dimension", () => {
  it("replaces each mapping once and then stops", () => {
    const local = Array.from({ length: 40 }, (_unused, index) => createLocalEvent({
      endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
      id: `event-state-${index}`,
      location: "Room 4",
      sourceEventUid: `source-uid-${index}`,
      startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
      summary: `Planning sync ${index} with the whole team`,
    }));
    const harness = new Harness(local, { rewrite: rewriteEveryDimension });
    harness.run("on");
    harness.clearEchoes();
    const firstRun = harness.run("on");
    expect(firstRun.stats.replaces).toBe(40);
    for (let run = 0; run < 6; run += 1) {
      const { stats } = harness.run("on");
      expect(stats.replaces).toBe(0);
      expect(stats.adds).toBe(0);
      expect(stats.removes).toBe(0);
    }
    expect(harness.remoteUids).toHaveLength(40);
    expect(harness.mappingRows).toHaveLength(40);
  });

  it("leaves a guest edit visible for repair rather than adopting it on the first run", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.run("on");
    harness.run("on");
    harness.clearEchoes();
    harness.mutateRemote(firstRemoteUid(harness), { summary: "Edited by a guest" });
    harness.run("on");
    harness.run("on");
    harness.run("on");
    const [remote] = harness.remoteEvents;
    expect(remote?.summary).toBe("Weekly");
  });
});

/* A mixed fleet is the production shape: the write count must stop growing. */
describe("a mixed fleet of 100 mirrors", () => {
  it("stops writing once every mirror has been corrected once", () => {
    const local = Array.from({ length: 100 }, (_unused, index) => createLocalEvent({
      endTime: new Date(Date.UTC(2026, 2, 8, 0, index, 30)),
      id: `event-state-${index}`,
      location: "Room 4",
      sourceEventUid: `source-uid-${index}`,
      startTime: new Date(Date.UTC(2026, 2, 8, 0, index, 0)),
      summary: `Planning sync ${index} with the whole team`,
    }));
    const harness = new Harness(local, {
      /* Keyed on the mirror rather than the write, so each one is lossy the same way forever. */
      rewrite: (stored, writeCount) => {
        const family = stored.startTime.getUTCMinutes() % 3;
        if (family === 0) {
          return stored;
        }
        if (family === 1) {
          return rewriteEveryDimension(stored, writeCount);
        }
        return shiftStoredTimes(30)(stored, writeCount);
      },
      writeEcho: echoWhatWasSent,
    });
    harness.run("on");
    expect(harness.providerWrites).toBe(100);
    harness.run("on");
    const afterCorrection = harness.providerWrites;
    for (let run = 0; run < 8; run += 1) {
      const { stats } = harness.run("on");
      expect(stats.adds).toBe(0);
      expect(stats.removes).toBe(0);
      expect(stats.replaces).toBe(0);
    }
    expect(harness.providerWrites).toBe(afterCorrection);
    expect(harness.remoteUids).toHaveLength(100);
    expect(harness.mappingRows).toHaveLength(100);
  });
});

/*
 * A destination whose rewrite is different every store can never be converged on. The
 * requirement is that it costs no more than the behaviour it replaces and never
 * accumulates mirrors or rows.
 */
const scrambleEveryDimension: Rewrite = (stored, writeCount) => ({
  ...stored,
  endTime: new Date(stored.endTime.getTime() + writeCount * 1000),
  startTime: new Date(stored.startTime.getTime() + writeCount * 1000),
  summary: `${stored.summary} ${writeCount}`,
});

describe("a destination whose rewrite is different every time", () => {
  it("costs at most one write a run and keeps exactly one mirror", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: scrambleEveryDimension });
    for (let run = 0; run < 15; run += 1) {
      harness.run("on");
      expect(harness.remoteUids).toHaveLength(1);
      expect(harness.mappingRows).toHaveLength(1);
    }
    expect(harness.providerWrites).toBeLessThanOrEqual(15);
  });

  it("never writes more than the comparison it replaces", () => {
    const echoed = new Harness([createLocalEvent()], { rewrite: scrambleEveryDimension });
    const legacy = new Harness([createLocalEvent()], { rewrite: scrambleEveryDimension });
    for (let run = 0; run < 15; run += 1) {
      echoed.run("on");
      legacy.run("off");
    }
    expect(echoed.providerWrites).toBeLessThanOrEqual(legacy.providerWrites);
  });
});

/*
 * Every distinct edit costs exactly one repair. Reapplying the identical one costs
 * nothing further: a rendering the row has already been replaced for and that came back is
 * indistinguishable from a destination that renders one stored mirror two ways, and
 * repeating a correction that provably did not stick is the churn issue #649 measures.
 * Both are visible as `echo.avoided_content_changed_count` on the wide event.
 */
describe("a destination a person edits on every run", () => {
  it("repairs each distinct edit once and stops fighting a reapplied one", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.run("on");
    harness.run("on");
    const settledWrites = harness.providerWrites;
    for (let run = 0; run < 6; run += 1) {
      harness.mutateRemote(firstRemoteUid(harness), { summary: `Edited by a guest ${run}` });
      harness.run("on");
      harness.run("on");
      const [remote] = harness.remoteEvents;
      expect(remote?.summary).toBe("Weekly");
    }
    expect(harness.providerWrites).toBe(settledWrites + 6);

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Edited by a guest 5" });
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 6);
  });
});

/*
 * A source change the editable hash cannot see -- a timezone or recurrence field --
 * still forces a replace, which must not reopen the churn the echo closed.
 */
describe("a source change outside the editable content", () => {
  it("settles again after a replace forced by a non editable field", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    harness.run("on");
    harness.run("on");
    const settledWrites = harness.providerWrites;
    harness.setLocal([createLocalEvent({ startTimeZone: "America/Toronto" })]);
    harness.run("on");
    expect(harness.providerWrites).toBe(settledWrites + 1);
    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(settledWrites + 1);
    expect(harness.remoteUids).toHaveLength(1);
  });
});

/*
 * The observation channel is a database write per mapping. It has to stop once a mirror
 * has settled, or the branch trades provider churn for a write of its own on every run.
 */
describe("the cost of the observation channel once a fleet has settled", () => {
  it("stops adopting once every mirror is confirmed", () => {
    const local = Array.from({ length: 25 }, (_unused, index) => createLocalEvent({
      endTime: new Date(Date.UTC(2026, 2, 8, 0, index, 30)),
      id: `event-state-${index}`,
      sourceEventUid: `source-uid-${index}`,
      startTime: new Date(Date.UTC(2026, 2, 8, 0, index, 0)),
      summary: `Planning sync ${index} with the whole team`,
    }));
    const harness = new Harness(local, { rewrite: rewriteEveryDimension });
    for (let run = 0; run < 4; run += 1) {
      harness.run("on");
    }
    const settledAdoptions = harness.adoptionsApplied;
    for (let run = 0; run < 6; run += 1) {
      const { adoptions } = harness.run("on");
      expect(adoptions).toHaveLength(0);
    }
    expect(harness.adoptionsApplied).toBe(settledAdoptions);
  });

  it("stops adopting when the destination never reports an availability", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: rewriteEveryDimension,
      writeEcho: (requested) => requested,
    });
    for (let run = 0; run < 4; run += 1) {
      harness.run("on");
    }
    const settledAdoptions = harness.adoptionsApplied;
    for (let run = 0; run < 6; run += 1) {
      harness.run("on");
    }
    expect(harness.adoptionsApplied).toBe(settledAdoptions);
  });
});

/* Shadow mode has to be observation only: the operations it produces must be the old ones. */
describe("shadow mode against a churning destination", () => {
  it("produces exactly the operations the disabled comparison produces", () => {
    const shadow = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    const disabled = new Harness([createLocalEvent()], { rewrite: rewriteEveryDimension });
    for (let run = 0; run < 8; run += 1) {
      shadow.run("shadow");
      disabled.run("off");
    }
    expect(shadow.stats).toEqual(disabled.stats);
    expect(shadow.providerWrites).toBe(disabled.providerWrites);
  });

  it("counts the content churn the comparison would have avoided", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
    });
    harness.run("shadow");
    const { echoCounts, stats } = harness.run("shadow");
    expect(stats.replaces).toBe(1);
    expect(echoCounts.legacyContentChangedCount).toBeGreaterThan(0);
    expect(echoCounts.avoidedContentChangedCount).toBeGreaterThan(0);
  });

  /*
   * The measurement shadow mode exists to provide, for the other family issue #649
   * measures: a destination that stores a shifted time.
   */
  it("counts the time churn the comparison would have avoided", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("shadow");
    const { echoCounts, stats } = harness.run("shadow");
    expect(stats.replaces).toBe(1);
    expect(echoCounts.eligibleCount).toBeGreaterThan(0);
  });

  /* The same destination under the enabled comparison, to scope the gap to shadow. */
  it("does record the same mirror once the comparison is enabled", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    const { echoCounts } = harness.run("on");
    expect(echoCounts.eligibleCount).toBeGreaterThan(0);
  });
});
