import "expo-sqlite/localStorage/install";
import { useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const STORAGE_PREFIX = "keeper.pref.";

export const preferences = {
  get<T>(key: string, fallback: T): T {
    try {
      const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      return value == null ? fallback : (JSON.parse(value) as T);
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    listeners.get(key)?.forEach((listener) => listener());
  },
  remove(key: string) {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    listeners.get(key)?.forEach((listener) => listener());
  },
  removePrefix(prefix: string) {
    const storagePrefix = `${STORAGE_PREFIX}${prefix}`;
    const keys = Array.from({ length: localStorage.length }, (_value, index) =>
      localStorage.key(index),
    ).filter((key): key is string => Boolean(key?.startsWith(storagePrefix)));
    for (const storageKey of keys) {
      localStorage.removeItem(storageKey);
      const key = storageKey.slice(STORAGE_PREFIX.length);
      listeners.get(key)?.forEach((listener) => listener());
    }
  },
  subscribe(key: string, listener: Listener) {
    const set = listeners.get(key) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  },
};

export function userPreferencePrefix(
  profileId: string,
  userId: string,
): string {
  return `user:${profileId}:${userId}:`;
}

export function clearUserPreferences(profileId: string, userId: string): void {
  preferences.removePrefix(userPreferencePrefix(profileId, userId));
  preferences.remove(`paused:${profileId}:${userId}`);
  preferences.remove(`push-enabled:${profileId}:${userId}`);
  preferences.remove("pending-intent");
}

export function clearProfileUserPreferences(profileId: string): void {
  preferences.removePrefix(`user:${profileId}:`);
  preferences.removePrefix(`paused:${profileId}:`);
  preferences.removePrefix(`push-enabled:${profileId}:`);
  preferences.remove("pending-intent");
}

export function usePreference<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    (listener) => preferences.subscribe(key, listener),
    () => preferences.get(key, fallback),
    () => fallback,
  );
  return [value, (next) => preferences.set(key, next)];
}
