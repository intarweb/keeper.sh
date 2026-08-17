import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/providers/app-provider";
import {
  cacheKindForPath,
  readCache,
  writeCache,
  type CacheKind,
} from "@/offline/cache";
import { KeeperApiError } from "@keeper.sh/api-client";

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh(): Promise<void>;
  stale: boolean;
  updatedAt: number | null;
}

interface ResourceOptions<T> {
  cache?: CacheKind;
  enabled?: boolean;
  load?: (signal: AbortSignal) => Promise<T>;
}

export function useApiResource<T>(
  path: string,
  enabledOrOptions: boolean | ResourceOptions<T> = true,
): ResourceState<T> {
  const { api, handleUnauthorized, profile, session } = useApp();
  const options =
    typeof enabledOrOptions === "boolean"
      ? { enabled: enabledOrOptions }
      : enabledOrOptions;
  const enabled = options.enabled ?? true;
  const loadRef = useRef(options.load);
  loadRef.current = options.load;
  const cacheKind = options.cache ?? cacheKindForPath(path);
  const scope = `${profile.id}:${session?.user.id ?? "anonymous"}`;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const next = loadRef.current
        ? await loadRef.current(controller.signal)
        : await api.get<T>(path);
      if (controller.signal.aborted) return;
      const now = Date.now();
      setData(next);
      setStale(false);
      setUpdatedAt(now);
      await writeCache(scope, path, next, cacheKind);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof KeeperApiError && reason.status === 401) {
        setError("Your Keeper session expired. Sign in again.");
        await handleUnauthorized();
        return;
      }
      const cached = await readCache<T>(scope, path);
      if (cached) {
        setData(cached.data);
        setUpdatedAt(cached.updatedAt);
        setStale(true);
      } else {
        setError(reason instanceof Error ? reason.message : "Request failed.");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, [api, cacheKind, enabled, handleUnauthorized, path, scope]);

  useEffect(() => {
    void refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);
  return { data, error, loading, refresh, stale, updatedAt };
}
