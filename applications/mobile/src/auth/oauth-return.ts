import type { OAuthTicketResult } from "@keeper.sh/api-contracts";

export function resolveOAuthTicketDestination(
  result: OAuthTicketResult,
  fallback = "/(tabs)/calendars",
): string {
  if (result.status === "cancelled")
    throw new Error("Provider authorization was cancelled.");
  if (result.status !== "success") {
    throw new Error(
      result.errorCode
        ? `Provider authorization failed (${result.errorCode}).`
        : "Provider authorization failed.",
    );
  }
  if (result.flow === "source" && result.resourceId) {
    return `/account/${encodeURIComponent(result.resourceId)}/setup`;
  }
  return fallback;
}
