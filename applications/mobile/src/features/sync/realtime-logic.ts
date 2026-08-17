import { syncSocketMessageSchema } from "@keeper.sh/api-contracts";

export interface LiveSyncState {
  connected: boolean;
  hasReceivedAggregate: boolean;
  lastSyncedAt: string | null;
  progress: number;
  remaining: number;
  seq: number;
  syncing: boolean;
}

export const initialLiveSyncState: LiveSyncState = {
  connected: false,
  hasReceivedAggregate: false,
  lastSyncedAt: null,
  progress: 100,
  remaining: 0,
  seq: -1,
  syncing: false,
};

export type SocketAction =
  | { kind: "aggregate"; state: LiveSyncState }
  | { kind: "ignore" }
  | { kind: "pong" }
  | { kind: "reconnect" };

export function parseSocketAction(
  raw: string,
  current: LiveSyncState,
): SocketAction {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "reconnect" };
  }
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { event?: unknown }).event !== "string"
  ) {
    return { kind: "reconnect" };
  }
  const event = (value as { event: string }).event;
  if (event === "ping") return { kind: "pong" };
  if (event !== "sync:aggregate") return { kind: "ignore" };
  if (!syncSocketMessageSchema.allows(value)) return { kind: "reconnect" };
  const data = syncSocketMessageSchema.assert(value).data;
  const forwardProgress =
    data.seq > current.seq ||
    data.progressPercent > current.progress ||
    data.syncEventsRemaining < current.remaining ||
    (current.syncing && !data.syncing && data.syncEventsRemaining === 0);
  if (!forwardProgress) return { kind: "ignore" };
  return {
    kind: "aggregate",
    state: {
      connected: true,
      hasReceivedAggregate: true,
      lastSyncedAt:
        data.lastSyncedAt === undefined
          ? current.lastSyncedAt
          : data.lastSyncedAt,
      progress: data.syncEventsRemaining === 0 ? 100 : data.progressPercent,
      remaining: data.syncEventsRemaining,
      seq: Math.max(current.seq, data.seq),
      syncing: data.syncing,
    },
  };
}

export function syncStatusLabel(state: LiveSyncState): string {
  if (!state.connected || !state.hasReceivedAggregate)
    return "Connecting to sync status…";
  if (state.syncing) return `Syncing · ${Math.round(state.progress)}%`;
  if (state.remaining === 0) return "Calendars are up to date";
  return `Sync paused · ${state.remaining} event${state.remaining === 1 ? "" : "s"} remaining`;
}
