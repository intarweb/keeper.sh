import { describe, expect, it } from "vitest";

import {
  initialLiveSyncState,
  parseSocketAction,
  syncStatusLabel,
} from "@/features/sync/realtime-logic";

function aggregate(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "sync:aggregate",
    data: {
      progressPercent: 25,
      seq: 1,
      syncEventsProcessed: 1,
      syncEventsRemaining: 3,
      syncEventsTotal: 4,
      syncing: true,
      ...overrides,
    },
  });
}

describe("realtime sync state", () => {
  it("accepts a validated aggregate and exposes truthful progress", () => {
    const action = parseSocketAction(aggregate(), initialLiveSyncState);
    expect(action.kind).toBe("aggregate");
    if (action.kind !== "aggregate")
      throw new Error("Expected aggregate state");
    expect(action.state).toMatchObject({
      connected: true,
      hasReceivedAggregate: true,
      progress: 25,
      remaining: 3,
      syncing: true,
    });
    expect(syncStatusLabel(action.state)).toBe("Syncing · 25%");
  });

  it("ignores stale aggregate sequence numbers", () => {
    const current = {
      ...initialLiveSyncState,
      connected: true,
      hasReceivedAggregate: true,
      progress: 60,
      remaining: 2,
      seq: 4,
      syncing: true,
    };
    expect(
      parseSocketAction(
        aggregate({ progressPercent: 20, seq: 3, syncEventsRemaining: 4 }),
        current,
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("marks a completed aggregate as 100 percent", () => {
    const current = {
      ...initialLiveSyncState,
      progress: 90,
      remaining: 1,
      seq: 4,
      syncing: true,
    };
    const action = parseSocketAction(
      aggregate({
        progressPercent: 99,
        seq: 5,
        syncEventsRemaining: 0,
        syncing: false,
      }),
      current,
    );
    expect(action.kind).toBe("aggregate");
    if (action.kind !== "aggregate")
      throw new Error("Expected aggregate state");
    expect(action.state.progress).toBe(100);
    expect(syncStatusLabel(action.state)).toBe("Calendars are up to date");
  });

  it("requests reconnect for malformed or contract-invalid messages", () => {
    expect(parseSocketAction("not json", initialLiveSyncState)).toEqual({
      kind: "reconnect",
    });
    expect(
      parseSocketAction(
        aggregate({ syncEventsRemaining: "three" }),
        initialLiveSyncState,
      ),
    ).toEqual({ kind: "reconnect" });
  });

  it("handles protocol ping and ignores unrelated events", () => {
    expect(parseSocketAction('{"event":"ping"}', initialLiveSyncState)).toEqual(
      { kind: "pong" },
    );
    expect(
      parseSocketAction(
        '{"event":"calendar:changed","data":{}}',
        initialLiveSyncState,
      ),
    ).toEqual({ kind: "ignore" });
  });
});
