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
import {
  MAX_REMEMBERED_REJECTED_ECHOES,
  parseRemoteStateEcho,
  rememberRejectedEcho,
  serializeRemoteStateEcho,
  splitRemoteStateEchoes,
} from "../../../src/core/events/remote-echo";
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

  public patchMappings(patch: Partial<EventMapping>): void {
    this.mappings = this.mappings.map((mapping) => ({ ...mapping, ...patch }));
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

const totalWrites = (harness: Harness): number => harness.providerWrites + harness.failedWrites;

/* The destination's second rendering of the same stored mirror. */
const heldSuffix = (listCount: number): string => {
  if (listCount % 2 === 0) {
    return "";
  }
  return " (held)";
};

/*
 * The measured churn family is a mirror whose read-back keeps differing. Rounds 1 to 4
 * only ever drove destinations with a single stable rendering per stored value. A
 * destination served by replicas that normalize differently, or one whose list endpoint
 * lags its own write path, renders the same stored mirror more than one way over time.
 */
describe("a destination that renders one stored mirror more than one way", () => {
  it("settles when the two renderings differ only by trailing whitespace", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${" ".repeat(listCount % 2)}`,
      }),
    });
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBe(1);
    expect(harness.providerDeletes).toBe(0);
  });

  it("settles when the summary genuinely alternates between two renderings", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${heldSuffix(listCount)}`,
      }),
    });
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(3);
    expect(harness.providerDeletes).toBeLessThanOrEqual(2);
  });

  it("settles when the listed start time alternates between two renderings", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        endTime: new Date(stored.endTime.getTime() + (listCount % 2) * 60_000),
        startTime: new Date(stored.startTime.getTime() + (listCount % 2) * 60_000),
      }),
    });
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(3);
  });

  it("stops replacing rather than replacing forever at a halved rate", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${heldSuffix(listCount)}`,
      }),
    });
    for (let run = 0; run < 40; run += 1) {
      harness.run("on");
    }
    const firstTwenty = harness.stats.slice(0, 20)
      .reduce((total, stats) => total + stats.replaces, 0);
    const lastTwenty = harness.stats.slice(20)
      .reduce((total, stats) => total + stats.replaces, 0);
    expect(firstTwenty).toBeGreaterThan(0);
    expect(lastTwenty).toBe(0);
  });

  /*
   * Both renderings differ from the source, so neither can be recognised by comparing
   * against the local event: the row is the only thing that remembers them, and adopting
   * whichever one this run happened to see would overwrite the other.
   */
  it("settles when it rewrites what it stores and alternates how it lists it", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${heldSuffix(listCount)}`,
      }),
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
    });
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBe(2);
    expect(harness.stats.slice(3).every((stats) => stats.replaces === 0)).toBe(true);
  });

  it("settles when the destination rotates through three renderings", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${"!".repeat(listCount % 3)}`,
      }),
    });
    for (let run = 0; run < 30; run += 1) {
      harness.run("on");
    }
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.providerWrites).toBeLessThanOrEqual(4);
  });

  /*
   * What the row remembers is written with the row itself, so convergence must not depend
   * on the best-effort observation write landing at all.
   */
  it("converges when no observation write ever lands", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${heldSuffix(listCount)}`,
      }),
    });
    harness.adoptionWritesLand = false;
    for (let run = 0; run < 20; run += 1) {
      harness.run("on");
    }
    expect(harness.providerWrites).toBeLessThanOrEqual(3);
  });

  it("never loses or duplicates the mirror while it flaps", () => {
    const harness = new Harness([createLocalEvent()], {
      listRewrite: (stored, listCount) => ({
        ...stored,
        summary: `${stored.summary}${heldSuffix(listCount)}`,
      }),
    });
    for (let run = 0; run < 30; run += 1) {
      harness.run("on");
      expect(harness.remoteUids).toHaveLength(1);
      expect(harness.mappingRows).toHaveLength(1);
    }
  });
});

/*
 * The allowance a replacement carries is meant to cover the destination's own second
 * rendering. A guest edit landing in the same window is a different thing and must not
 * ride it.
 */
describe("a genuine change while the one-shot allowance is live", () => {
  it("repairs a destination edit made in the run after a correction", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
      writeEcho: (requested) => requested,
    });
    harness.run("on");
    harness.run("on");
    const writesAfterCorrection = harness.providerWrites;
    expect(writesAfterCorrection).toBe(2);

    harness.mutateRemote(firstRemoteUid(harness), { summary: "Hijacked while forgiving" });
    harness.run("on");
    expect(harness.providerWrites).toBe(writesAfterCorrection + 1);
  });

  it("propagates a local edit made in the run after a correction", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
      writeEcho: (requested) => requested,
    });
    harness.run("on");
    harness.run("on");
    const writesAfterCorrection = harness.providerWrites;

    harness.setLocal([createLocalEvent({ summary: "Renamed at the source" })]);
    harness.run("on");
    expect(harness.providerWrites).toBe(writesAfterCorrection + 1);
    const [stored] = harness.remoteEvents;
    expect(stored?.summary).toBe("Rename");
  });

  it("re-creates a mirror deleted in the run after a correction", () => {
    const harness = new Harness([createLocalEvent()], {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
      writeEcho: (requested) => requested,
    });
    harness.run("on");
    harness.run("on");
    const writesAfterCorrection = harness.providerWrites;

    harness.dropRemote(firstRemoteUid(harness));
    harness.run("on");
    expect(harness.providerWrites).toBe(writesAfterCorrection + 1);
    expect(harness.remoteUids).toHaveLength(1);
    expect(harness.mappingRows).toHaveLength(1);
  });
});

/*
 * The echo column is free text on the row. Nothing validates its shape on read, and the
 * reconciler runs one comparison loop for every mapping on the calendar.
 */
describe("a persisted echo the parser cannot read", () => {
  it("does not abort the whole calendar's reconciliation", () => {
    const harness = new Harness(
      Array.from({ length: 5 }, (_unused, index) =>
        createLocalEvent({
          id: `event-state-${index}`,
          sourceEventUid: `source-uid-${index}`,
        })),
    );
    harness.run("on");
    expect(harness.mappingRows).toHaveLength(5);

    const [poisoned] = harness.mappingRows;
    if (!poisoned) {
      throw new Error("no mapping");
    }
    poisoned.remoteContentHash = `${poisoned.remoteContentHash?.split("|")[0]}|NaN|NaN|busy`;

    expect(() => harness.run("on")).not.toThrow();
  });

  it("degrades one mapping to the source comparison rather than the calendar", () => {
    const harness = new Harness([createLocalEvent()]);
    harness.run("on");
    const [mapping] = harness.mappingRows;
    if (!mapping) {
      throw new Error("no mapping");
    }
    const [contentHash] = mapping.remoteContentHash?.split("|") ?? [];
    mapping.remoteContentHash = `${contentHash}|not-a-number||busy`;

    const results: RunResult[] = [];
    expect(() => results.push(harness.run("on"))).not.toThrow();
    /* Degraded, not swallowed: the run says so on the wide event. */
    expect(results[0]?.echoCounts.unreadableCount).toBe(1);
  });

  it("keeps the other twenty-nine mirrors reconciling", () => {
    const harness = new Harness(
      Array.from({ length: 30 }, (_unused, index) =>
        createLocalEvent({
          endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
          id: `event-state-${index}`,
          sourceEventUid: `source-uid-${index}`,
          startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
        })),
    );
    harness.run("on");
    const [poisoned, ...rest] = harness.mappingRows;
    if (!poisoned) {
      throw new Error("no mapping");
    }
    const [contentHash] = poisoned.remoteContentHash?.split("|") ?? [];
    poisoned.remoteContentHash = `${contentHash}|NaN|NaN|busy`;
    const [survivor] = rest;
    if (!survivor) {
      throw new Error("no survivor");
    }
    harness.mutateRemote(survivor.destinationEventUid, { summary: "Hijacked by a guest" });

    const result = harness.run("on");
    expect(result.stats.replaces).toBe(1);
  });
});

/*
 * The row grows for as long as a destination keeps inventing renderings, so what it
 * remembers has to be bounded: the oldest rendering ages out and is repaired again.
 */
describe("what a mapping remembers of what it rejected", () => {
  const rememberAll = (renderings: string[]): string | null => {
    let remembered: string | null = null;
    for (const rendering of renderings) {
      remembered = rememberRejectedEcho(remembered, rendering);
    }
    return remembered;
  };

  it("keeps the newest renderings and drops the oldest past the bound", () => {
    const renderings = Array.from(
      { length: MAX_REMEMBERED_REJECTED_ECHOES + 2 },
      (_unused, index) => `echo-${index}`,
    );
    const remembered = rememberAll(renderings);

    expect(splitRemoteStateEchoes(remembered)).toStrictEqual(
      renderings.toReversed().slice(0, MAX_REMEMBERED_REJECTED_ECHOES),
    );
  });

  it("moves a rendering it already remembers to the front rather than duplicating it", () => {
    const remembered = rememberAll(["a", "b", "a"]);

    expect(splitRemoteStateEchoes(remembered)).toStrictEqual(["a", "b"]);
  });
});

/*
 * A Google resource whose dateTime does not parse yields an Invalid Date rather than a
 * failure, and that Invalid Date is what the push-time echo is serialized from.
 */
describe("an echo serialized from a time the provider did not parse", () => {
  it("round-trips rather than poisoning the row it is written to", () => {
    const contentHash = createEditableEventContentHash({ summary: "Weekly planning sync" });
    const echo = serializeRemoteStateEcho({
      availability: "busy",
      contentHash,
      endTime: new Date("not a date"),
      startTime: new Date("not a date"),
    });

    expect(() => parseRemoteStateEcho(echo)).not.toThrow();
    expect(parseRemoteStateEcho(echo)).toStrictEqual({
      availability: "busy",
      contentHash,
      endSecond: null,
      startSecond: null,
    });
  });
});

/*
 * Bumping EDITABLE_CONTENT_ECHO_ALGORITHM is the documented way to retire every recorded
 * echo fleet-wide. The fleet must then behave exactly as it does on day one.
 */
describe("a fleet whose recorded echoes were written by a retired algorithm", () => {
  const fleet = (count: number): MaterializedSyncableEvent[] =>
    Array.from({ length: count }, (_unused, index) =>
      createLocalEvent({
        endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
      }));

  it("corrects each mirror once and then goes quiet", () => {
    const harness = new Harness(fleet(30), {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
    });
    harness.run("on");
    expect(harness.providerWrites).toBe(30);
    harness.patchMappings({ remoteEchoAlgorithm: "editable-content-v0" });

    const afterBump = harness.run("on");
    expect(afterBump.stats.replaces).toBe(30);
    for (let run = 0; run < 5; run += 1) {
      const quiet = harness.run("on");
      expect(quiet.stats).toStrictEqual({ adds: 0, removes: 0, replaces: 0 });
    }
    expect(harness.remoteUids).toHaveLength(30);
    expect(harness.mappingRows).toHaveLength(30);
  });
});

/*
 * A long horizon is the only way to tell convergence from a slower leak: the production
 * symptom is a mirror replaced roughly a thousand times a day.
 */
describe("a long horizon against a lossy destination", () => {
  const fleet = (count: number): MaterializedSyncableEvent[] =>
    Array.from({ length: count }, (_unused, index) =>
      createLocalEvent({
        endTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 30)),
        id: `event-state-${index}`,
        sourceEventUid: `source-uid-${index}`,
        startTime: new Date(Date.UTC(2026, 2, 8, 9 + index, 0)),
      }));

  it("writes nothing after the first correction over two hundred runs", () => {
    const harness = new Harness(fleet(20), {
      rewrite: (stored) => ({
        ...stored,
        endTime: new Date(stored.endTime.getTime() + 30_000),
        startTime: new Date(stored.startTime.getTime() + 30_000),
        summary: stored.summary.slice(0, 6),
      }),
      writeEcho: (requested) => requested,
    });
    for (let run = 0; run < 200; run += 1) {
      harness.run("on");
    }
    expect(totalWrites(harness)).toBe(40);
    expect(harness.remoteUids).toHaveLength(20);
    expect(harness.mappingRows).toHaveLength(20);
  });

  it("stops proposing observation writes once the fleet has settled", () => {
    const harness = new Harness(fleet(20), {
      rewrite: (stored) => ({ ...stored, summary: stored.summary.slice(0, 6) }),
    });
    for (let run = 0; run < 5; run += 1) {
      harness.run("on");
    }
    const before = harness.adoptionsApplied;
    for (let run = 0; run < 50; run += 1) {
      const result = harness.run("on");
      expect(result.adoptions).toHaveLength(0);
    }
    expect(harness.adoptionsApplied).toBe(before);
  });
});
