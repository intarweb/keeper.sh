import { isSafeInternalPath } from "@/navigation/deep-links";

const notificationTypes = new Set([
  "calendar_invite",
  "reauthentication_required",
  "sync_failed",
]);
const identifierPattern = /^[A-Za-z0-9_-]+$/;

function readParams(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (
    !entries.every(
      ([key, item]) =>
        key.length <= 64 && typeof item === "string" && item.length <= 256,
    )
  )
    return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

export function resolveNotificationPath(
  data: Record<string, unknown>,
): string | null {
  if (
    typeof data.notificationType !== "string" ||
    !notificationTypes.has(data.notificationType)
  )
    return null;
  if (data.schemaVersion !== undefined && data.schemaVersion !== 1) return null;
  if (
    !data.deepLink ||
    typeof data.deepLink !== "object" ||
    Array.isArray(data.deepLink)
  )
    return null;
  const deepLink = data.deepLink as Record<string, unknown>;
  if (deepLink.version !== undefined && deepLink.version !== 1) return null;
  if (typeof deepLink.path !== "string") return null;
  const params = readParams(deepLink.params);
  if (!params) return null;

  let destination: string;
  if (deepLink.path === "/accounts") destination = "/(tabs)/calendars";
  else if (deepLink.path === "/accounts/[id]") {
    const id = params.id ?? params.accountId;
    if (!id || !identifierPattern.test(id)) return null;
    destination = `/account/${id}`;
  } else if (deepLink.path === "/calendar") {
    const id = params.id ?? params.calendarId;
    if (!id || !identifierPattern.test(id)) return null;
    destination = `/calendar/${id}`;
  } else if (deepLink.path === "/invitations")
    destination = "/(tabs)/today/invitations";
  else return null;

  return isSafeInternalPath(destination) ? destination : null;
}
