import type { UserSession } from "@/api/domain";

export type SessionFetchState =
  | { kind: "success"; session: UserSession | null }
  | { error: unknown; kind: "error" };

export type StartupSessionDecision =
  | { kind: "authenticated"; session: UserSession }
  | { kind: "offline"; session: UserSession }
  | { kind: "signed-out"; session: null }
  | { kind: "unauthorized"; session: null }
  | { error: unknown; kind: "unavailable"; session: null };

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function isExplicitUnauthorized(error: unknown): boolean {
  const record = readRecord(error);
  if (!record) return false;
  const response = readRecord(record.response);
  if (
    record.status === 401 ||
    record.statusCode === 401 ||
    response?.status === 401
  )
    return true;
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  return code === "UNAUTHORIZED" || code === "SESSION_EXPIRED";
}

export function isTransportUnavailable(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const record = readRecord(error);
  if (!record) return false;
  const response = readRecord(record.response);
  const status = record.status ?? record.statusCode ?? response?.status;
  if (typeof status === "number" && status !== 0) return false;
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  if (
    [
      "ECONNABORTED",
      "ECONNREFUSED",
      "ENETUNREACH",
      "FETCH_ERROR",
      "NETWORK_ERROR",
    ].includes(code)
  )
    return true;
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("network unavailable") ||
    message === "offline"
  );
}

export function decideStartupSession(
  fetchState: SessionFetchState,
  cached: UserSession | null,
): StartupSessionDecision {
  if (fetchState.kind === "success") {
    return fetchState.session
      ? { kind: "authenticated", session: fetchState.session }
      : { kind: "signed-out", session: null };
  }
  if (isExplicitUnauthorized(fetchState.error))
    return { kind: "unauthorized", session: null };
  if (cached && isTransportUnavailable(fetchState.error))
    return { kind: "offline", session: cached };
  return { error: fetchState.error, kind: "unavailable", session: null };
}
