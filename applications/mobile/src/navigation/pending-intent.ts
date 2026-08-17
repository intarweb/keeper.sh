import { preferences } from "@/storage/preferences";
import { isSafeInternalPath } from "@/navigation/deep-links";

const PENDING_INTENT_KEY = "pending-auth-intent";

export function storePendingIntent(path: string): boolean {
  if (!isSafeInternalPath(path)) return false;
  preferences.set(PENDING_INTENT_KEY, path);
  return true;
}

export function peekPendingIntent(): string | null {
  const value = preferences.get<unknown>(PENDING_INTENT_KEY, null);
  return typeof value === "string" && isSafeInternalPath(value) ? value : null;
}

export function consumePendingIntent(): string | null {
  const value = peekPendingIntent();
  preferences.remove(PENDING_INTENT_KEY);
  return value;
}
