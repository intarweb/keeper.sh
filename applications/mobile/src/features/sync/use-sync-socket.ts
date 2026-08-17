import { useEffect, useRef, useState } from "react";

import { useApp } from "@/providers/app-provider";
import {
  initialLiveSyncState,
  parseSocketAction,
  type LiveSyncState,
} from "@/features/sync/realtime-logic";

const BASE_RECONNECT_MS = 2_000;
const MAX_RECONNECT_MS = 30_000;
const INITIAL_AGGREGATE_TIMEOUT_MS = 10_000;

export function useSyncSocket(): LiveSyncState {
  const { api, profile } = useApp();
  const [state, setState] = useState<LiveSyncState>(initialLiveSyncState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let disposed = false;
    let attempts = 0;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let aggregateTimeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(
        BASE_RECONNECT_MS * 2 ** attempts,
        MAX_RECONNECT_MS,
      );
      attempts += 1;
      reconnect = setTimeout(() => {
        void connect();
      }, delay);
    };
    const connect = async () => {
      try {
        const result = await api.client.getSocketUrl(controller.signal);
        const url =
          result.socketUrl ??
          new URL(result.socketPath ?? "/api/socket", profile.baseUrl)
            .toString()
            .replace(/^http/, "ws");
        if (disposed) return;
        socket = new WebSocket(url);
        socket.onopen = () => {
          attempts = 0;
          const next = {
            ...stateRef.current,
            connected: true,
            hasReceivedAggregate: false,
            seq: -1,
          };
          stateRef.current = next;
          setState(next);
          aggregateTimeout = setTimeout(
            () => socket?.close(),
            INITIAL_AGGREGATE_TIMEOUT_MS,
          );
        };
        socket.onmessage = (event) => {
          const action = parseSocketAction(
            String(event.data),
            stateRef.current,
          );
          if (action.kind === "pong")
            socket?.send(JSON.stringify({ event: "pong" }));
          else if (action.kind === "reconnect") socket?.close();
          else if (action.kind === "aggregate") {
            if (aggregateTimeout) clearTimeout(aggregateTimeout);
            stateRef.current = action.state;
            setState(action.state);
          }
        };
        socket.onclose = () => {
          if (aggregateTimeout) clearTimeout(aggregateTimeout);
          const next = {
            ...stateRef.current,
            connected: false,
            hasReceivedAggregate: false,
          };
          stateRef.current = next;
          setState(next);
          scheduleReconnect();
        };
        socket.onerror = () => socket?.close();
      } catch {
        const next = {
          ...stateRef.current,
          connected: false,
          hasReceivedAggregate: false,
        };
        stateRef.current = next;
        setState(next);
        scheduleReconnect();
      }
    };
    void connect();
    return () => {
      disposed = true;
      controller.abort();
      if (reconnect) clearTimeout(reconnect);
      if (aggregateTimeout) clearTimeout(aggregateTimeout);
      socket?.close();
    };
  }, [api.client, profile.baseUrl]);
  return state;
}
