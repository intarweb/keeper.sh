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

const echoWhatWasSent = (requested: StoredRemote): StoredRemote => requested;

const shiftStoredTimes = (seconds: number): Rewrite => (stored) => ({
  ...stored,
  endTime: new Date(stored.endTime.getTime() + seconds * 1000),
  startTime: new Date(stored.startTime.getTime() + seconds * 1000),
});

/*
 * A provider that reports back exactly what it was handed and only reveals its own
 * rendering on a later read. Round 2 established this shape for the content dimension;
 * these repeat it for the two dimensions reconciliation also finds a mirror stale in.
 */
describe("provider normalizes asynchronously in a dimension other than content", () => {
  it("settles when the destination reveals a shifted start time only on a later read", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: shiftStoredTimes(30),
      writeEcho: echoWhatWasSent,
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });

  it("settles when the destination reveals a coerced availability only on a later read", () => {
    const harness = new Harness([createLocalEvent({ availability: "free" })], {
      rewrite: (stored) => ({ ...stored, availability: "busy" }),
      writeEcho: echoWhatWasSent,
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });

  it("settles when the destination reveals a rewritten summary only on a later read", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 5) }),
      writeEcho: echoWhatWasSent,
    });
    for (let run = 0; run < 10; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(2);
  });
});

/*
 * Pins where the two failures above come from: the allowance a replacement carries for
 * the read-back it rejected is recorded for a content divergence and for nothing else.
 */
describe("the replacement a non-content divergence forces", () => {
  const replacementFor = (
    mapping: EventMapping,
    remoteEvent: RemoteEvent,
    localEvent: MaterializedSyncableEvent,
  ): { rejectedContentHash?: string } => {
    const { operations } = computeSyncOperations(
      [localEvent],
      [mapping],
      [remoteEvent],
      SCOPE,
      { maxAdoptionsPerRun: 2000, mode: "on" },
    );
    const replacement = operations.find((operation) => operation.type === "replace");
    if (!replacement || replacement.type !== "replace") {
      throw new Error("expected a replacement operation");
    }
    return replacement;
  };

  const localEvent = createLocalEvent();
  const pushedEcho = serializeRemoteStateEcho({
    availability: "busy",
    contentHash: createEditableEventContentHash({
      availability: "busy",
      endTime: localEvent.endTime,
      startTime: localEvent.startTime,
      summary: localEvent.summary,
    }),
    endTime: localEvent.endTime,
    startTime: localEvent.startTime,
  });
  const mapping: EventMapping = {
    calendarId: "destination-calendar-id",
    deleteIdentifier: "remote-1",
    destinationEventUid: "remote-1",
    endTime: localEvent.endTime,
    eventStateId: localEvent.id,
    id: "mapping-1",
    remoteContentHash: pushedEcho,
    remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
    remoteEchoAt: new Date("2026-03-01T00:00:00.000Z"),
    remoteRejectedContentHash: null,
    sourceCalendarId: "source-calendar-id",
    startTime: localEvent.startTime,
    syncEventHash: createSyncEventContentHash(localEvent),
    syncEventId: localEvent.id,
  };
  const remoteEvent = (stored: StoredRemote): RemoteEvent => ({
    deleteId: stored.deleteId,
    editableAvailability: stored.availability,
    editableContentHash: editableHashOf(stored),
    endTime: stored.endTime,
    isKeeperEvent: true,
    startTime: stored.startTime,
    supportedAvailabilities: ["busy", "free"],
    uid: stored.uid,
  });
  const storedBase: StoredRemote = {
    availability: "busy",
    deleteId: "remote-1",
    endTime: localEvent.endTime,
    startTime: localEvent.startTime,
    summary: localEvent.summary,
    uid: "remote-1",
  };

  it("carries the rejected read-back when the content diverged", () => {
    const replacement = replacementFor(
      mapping,
      remoteEvent({ ...storedBase, summary: "Weekl" }),
      localEvent,
    );
    expect(replacement.rejectedContentHash).toBeTypeOf("string");
  });

  it("carries the rejected read-back when only the time diverged", () => {
    const replacement = replacementFor(
      mapping,
      remoteEvent({
        ...storedBase,
        endTime: new Date(storedBase.endTime.getTime() + 30_000),
        startTime: new Date(storedBase.startTime.getTime() + 30_000),
      }),
      localEvent,
    );
    expect(replacement.rejectedContentHash).toBeTypeOf("string");
  });

  /*
   * The editable content hash covers the summary, description, location and all-day flag
   * and nothing else, so an availability divergence is only isolated when the mapping was
   * written for the same availability the source asks for and the destination reports a
   * different one. Hashing the mapping against the busy source instead would move the
   * local hash, which is a local edit rather than a remote divergence.
   */
  it("carries the rejected read-back when only the availability diverged", () => {
    const freeLocalEvent = createLocalEvent({ availability: "free" });
    const freeMapping: EventMapping = {
      ...mapping,
      remoteContentHash: serializeRemoteStateEcho({
        availability: "free",
        contentHash: createEditableEventContentHash(freeLocalEvent),
        endTime: freeLocalEvent.endTime,
        startTime: freeLocalEvent.startTime,
      }),
      syncEventHash: createSyncEventContentHash(freeLocalEvent),
    };
    const replacement = replacementFor(
      freeMapping,
      remoteEvent({ ...storedBase, availability: "busy" }),
      freeLocalEvent,
    );
    expect(replacement.rejectedContentHash).toBeTypeOf("string");
  });
});

describe("genuine divergence in the time and availability dimensions still propagates", () => {
  it("repairs a destination-side reschedule once the time echo has settled", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    const uid = firstRemoteUid(harness);
    harness.mutateRemote(uid, {
      endTime: new Date("2026-03-08T18:00:00.000Z"),
      startTime: new Date("2026-03-08T17:00:00.000Z"),
    });
    harness.run("on");
    expect(harness.providerWrites).toBe(2);
  });

  it("repairs a destination edit against an availability-coercing destination", () => {
    const harness = new Harness([createLocalEvent({ availability: "free" })], {
      rewrite: (stored) => ({ ...stored, availability: "busy" }),
    });
    harness.run("on");
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked by a guest" });
    harness.run("on");
    expect(harness.providerWrites).toBe(2);
  });

  it("propagates a local reschedule against a time-rewriting destination", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    harness.setLocal([createLocalEvent({
      endTime: new Date("2026-03-08T16:30:00.000Z"),
      startTime: new Date("2026-03-08T15:30:00.000Z"),
    })]);
    harness.run("on");
    expect(harness.providerWrites).toBe(2);

    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(2);
    const [stored] = harness.remoteEvents;
    expect(stored?.startTime.toISOString()).toBe("2026-03-08T15:30:30.000Z");
  });
});

/*
 * A destination that reports one rendering on the read after a push and a different one on
 * the read after that is, from reconciliation's side, the same observation sequence as a
 * guest who re-applies an edit every other run: reject X, confirm the pushed Y, see X
 * again. Accepting X the second time is what "retires the rejected allowance on a quiet
 * run" below forbids, because it bakes a guest's version in permanently, so the two cannot
 * both be had and the design keeps the repair. What the echo does buy here is the quiet run
 * in between -- the read that reproduces the push is no longer a divergence -- which halves
 * the churn against the one-replace-per-run this family used to cost, in every dimension
 * alike: a summary that genuinely alternates behaves identically to a time that does.
 */
describe("a destination that renders one mirror two ways over time", () => {
  it("rewrites a mirror whose listed start time alternates at most every other run", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        endTime: new Date(stored.endTime.getTime() + (listCount % 2) * 1000),
        startTime: new Date(stored.startTime.getTime() + (listCount % 2) * 1000),
      }),
    });
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(10);
    const consecutiveRewrites = harness.stats.filter((stats, index) =>
      stats.replaces > 0 && (harness.stats[index - 1]?.replaces ?? 0) > 0);
    expect(consecutiveRewrites).toHaveLength(0);
  });
});

describe("a fleet whose destinations rewrite different dimensions", () => {
  const fleet = (count: number): MaterializedSyncableEvent[] =>
    Array.from({ length: count }, (_unused, index) =>
      createLocalEvent({
        endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
        summary: `Mirror ${index} weekly review`,
      }));

  it("converges every family within one correction and never duplicates a mirror", () => {
    const events = fleet(60);
    const harness = new Harness(events, {
      rewrite: (stored) => {
        const index = Number(stored.summary.split(" ")[1] ?? "0");
        if (index % 3 === 0) {
          return { ...stored, summary: stored.summary.slice(0, 6) };
        }
        if (index % 3 === 1) {
          return {
            ...stored,
            endTime: new Date(stored.endTime.getTime() + 30_000),
            startTime: new Date(stored.startTime.getTime() + 30_000),
          };
        }
        return stored;
      },
    });

    harness.run("on");
    expect(harness.providerWrites).toBe(60);
    for (let run = 0; run < 6; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(60);
    expect(harness.providerDeletes).toBe(0);
    expect(harness.remoteUids).toHaveLength(60);
    expect(harness.mappingRows).toHaveLength(60);
  });
});

describe("day one, with every echo column empty across a fleet", () => {
  const fleet = (count: number): MaterializedSyncableEvent[] =>
    Array.from({ length: count }, (_unused, index) =>
      createLocalEvent({
        endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
        summary: `Mirror ${index} weekly review`,
      }));

  it("settles a content-rewriting destination after exactly one correction each", () => {
    const harness = new Harness(fleet(40), {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
    });
    harness.run("on");
    harness.clearEchoes();

    const firstDayOne = harness.run("on");
    expect(firstDayOne.stats.replaces).toBe(40);
    harness.providerWrites = 0;
    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(0);
    expect(harness.remoteUids).toHaveLength(40);
  });

  it("settles a time-rewriting destination after exactly one correction each", () => {
    const harness = new Harness(fleet(40), { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    harness.clearEchoes();

    const firstDayOne = harness.run("on");
    expect(firstDayOne.stats.replaces).toBe(40);
    harness.providerWrites = 0;
    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(0);
    expect(harness.remoteUids).toHaveLength(40);
  });
});

describe("a re-materialized occurrence that carries a rejected read-back", () => {
  const seriesEvent = (id: string): MaterializedSyncableEvent =>
    createLocalEvent({ eventStateId: "series-1", id });

  it("retires the rejected allowance on a quiet run when no remap intervenes", () => {
    const harness = new Harness([seriesEvent("occurrence-a")], {
      writeEcho: echoWhatWasSent,
    });
    harness.run("on");

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    harness.run("on");
    expect(harness.providerWrites).toBe(2);

    harness.run("on");
    const writesAfterQuietRun = harness.providerWrites;

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    harness.run("on");
    expect(harness.providerWrites).toBe(writesAfterQuietRun + 1);
  });

  it("retires the rejected allowance rather than carrying it across a database remap", () => {
    const harness = new Harness([seriesEvent("occurrence-a")], {
      writeEcho: echoWhatWasSent,
    });
    harness.run("on");

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    harness.run("on");
    expect(harness.providerWrites).toBe(2);

    harness.setLocal([seriesEvent("occurrence-b")]);
    harness.run("on");
    const writesAfterRemap = harness.providerWrites;

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Guest rewrote this" });
    harness.run("on");
    expect(harness.providerWrites).toBe(writesAfterRemap + 1);
  });
});

describe("no mirror is lost or duplicated while a dimension is being learned", () => {
  it("re-creates a mirror the destination deleted, against a time-rewriting provider", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    harness.run("on");
    expect(harness.providerWrites).toBe(1);

    harness.dropRemote(firstRemoteUid(harness));
    harness.run("on");
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBe(2);

    for (let run = 0; run < 4; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(2);
    expect(harness.mappingRows).toHaveLength(1);
  });

  it("removes the mirror when the source event goes away, against a time-rewriting provider", () => {
    const harness = new Harness([createLocalEvent()], { rewrite: shiftStoredTimes(30) });
    harness.run("on");
    harness.run("on");
    harness.setLocal([]);
    const result = harness.run("on");
    expect(harness.remoteUids).toHaveLength(0);
    expect(result.stats.removes).toBe(1);
  });
});
