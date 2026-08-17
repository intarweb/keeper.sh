import type { UserSession } from "@/api/domain";

export function parseSecureCachedSession(
  raw: string | null,
  cookie: string,
  now = Date.now(),
): UserSession | null {
  if (!raw || !cookie) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      !value ||
      typeof value !== "object" ||
      !("user" in value) ||
      !("session" in value)
    )
      return null;
    const candidate = value as UserSession;
    const expiresAt = new Date(candidate.session.expiresAt).getTime();
    if (
      !candidate.user?.id ||
      !candidate.session?.id ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    )
      return null;
    return candidate;
  } catch {
    return null;
  }
}
