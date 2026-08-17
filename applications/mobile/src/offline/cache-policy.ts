export type CacheKind = "agenda" | "metadata" | "none";

export function cacheKindForPath(path: string): CacheKind {
  if (/^\/api\/(?:v1\/)?events\?/.test(path)) return "agenda";
  if (
    path === "/api/accounts" ||
    path.startsWith("/api/accounts/") ||
    path === "/api/sources" ||
    /^\/api\/sources\/[^/]+$/.test(path) ||
    path === "/api/entitlements" ||
    path === "/api/ical/settings" ||
    path === "/api/mobile/notifications/preferences" ||
    path === "/api/sync/status"
  )
    return "metadata";
  return "none";
}

function minimizeAgenda(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((value) => {
    if (!value || typeof value !== "object") return value;
    const event = value as Record<string, unknown>;
    return {
      availability: event.availability,
      calendarId: event.calendarId,
      calendarName: event.calendarName,
      calendarProvider: event.calendarProvider,
      endTime: event.endTime,
      eventStateId: event.eventStateId,
      id: event.id,
      isAllDay: event.isAllDay,
      startTime: event.startTime,
      title: event.title,
    };
  });
}

export function minimizeCacheValue(kind: CacheKind, data: unknown): unknown {
  return kind === "agenda" ? minimizeAgenda(data) : data;
}

function minimizeAccounts(data: unknown): unknown {
  const values = Array.isArray(data) ? data : [data];
  const minimized = values.map((value) => {
    if (!value || typeof value !== "object") return value;
    const account = value as Record<string, unknown>;
    return {
      accountLabel: account.accountLabel,
      authType: account.authType,
      calendarCount: account.calendarCount,
      createdAt: account.createdAt,
      displayName: account.displayName,
      id: account.id,
      needsReauthentication: account.needsReauthentication,
      provider: account.provider,
      providerIcon: account.providerIcon,
      providerName: account.providerName,
    };
  });
  return Array.isArray(data) ? minimized : minimized[0];
}

export function minimizeCacheValueForPath(
  kind: CacheKind,
  path: string,
  data: unknown,
): unknown {
  if (kind === "agenda") return minimizeAgenda(data);
  if (path === "/api/accounts" || path.startsWith("/api/accounts/"))
    return minimizeAccounts(data);
  return data;
}
