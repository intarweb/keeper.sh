const safeStaticPaths = new Set([
  "/(tabs)/today",
  "/(tabs)/today/activity",
  "/(tabs)/today/invitations",
  "/(tabs)/today/sync-control",
  "/(tabs)/calendars",
  "/(tabs)/calendars/connect",
  "/(tabs)/calendars/connect-provider",
  "/(tabs)/settings",
  "/(tabs)/settings/about",
  "/(tabs)/settings/api-tokens",
  "/(tabs)/settings/feedback",
  "/(tabs)/settings/ical",
  "/(tabs)/settings/notifications",
  "/(tabs)/settings/passkeys",
  "/(tabs)/settings/plan",
  "/(tabs)/settings/privacy",
  "/(tabs)/settings/profile",
  "/(tabs)/settings/report",
  "/(tabs)/settings/security",
  "/(tabs)/settings/server",
]);

const safeResourcePatterns = [
  /^\/event\/[A-Za-z0-9_-]+$/,
  /^\/calendar\/[A-Za-z0-9_-]+$/,
  /^\/account\/[A-Za-z0-9_-]+(?:\/setup)?$/,
];

export function resolveOpenPath(segments: string[]): string {
  const [kind, id] = segments;
  const candidate =
    kind === "event" && id
      ? `/event/${id}`
      : kind === "calendar" && id
        ? `/calendar/${id}`
        : kind === "account" && id
          ? `/account/${id}`
          : kind === "invitation"
            ? "/(tabs)/today/invitations"
            : kind === "reauthentication" || kind === "sync"
              ? "/(tabs)/today/sync-control"
              : "/(tabs)/today";
  return isSafeInternalPath(candidate)
    ? candidate
    : "/(tabs)/today";
}

export function isSafeInternalPath(value: string): boolean {
  return (
    safeStaticPaths.has(value) ||
    safeResourcePatterns.some((pattern) => pattern.test(value))
  );
}

export type OpenRequest =
  | { destination: string; kind: "navigation" }
  | { destination: string; kind: "oauth" }
  | { error: string; kind: "error" };

export function parseOAuthTicketParam(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024)
    return null;
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

export function resolveOpenRequest(
  segments: string[],
  ticket: unknown,
): OpenRequest {
  if (
    segments[0] === "oauth" &&
    segments[1] === "callback" &&
    segments.length === 2
  ) {
    const parsedTicket = parseOAuthTicketParam(ticket);
    if (!parsedTicket)
      return {
        error: "The provider returned an invalid or missing connection ticket.",
        kind: "error",
      };
    return {
      destination: `/oauth/callback?ticket=${encodeURIComponent(parsedTicket)}`,
      kind: "oauth",
    };
  }
  return { destination: resolveOpenPath(segments), kind: "navigation" };
}
