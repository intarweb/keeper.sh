import type {
  Account,
  ApiToken as ContractApiToken,
  AuthCapabilities as ContractAuthCapabilities,
  CalendarDetail as ContractCalendarDetail,
  CalendarSource,
  Entitlements as ContractEntitlements,
  Event as ContractEvent,
  PendingInvite as ContractPendingInvite,
  SafeSession,
  SyncDestinationStatus as ContractSyncDestinationStatus,
} from "@keeper.sh/api-contracts";

/** Compatibility names for feature code. The source of truth is api-contracts. */
export type Identifier = string;
export type AuthCapabilities = ContractAuthCapabilities;
export type UserSession = SafeSession;
export type CalendarAccount = Account;
export type CalendarSummary = CalendarSource;
export type CalendarDetail = ContractCalendarDetail;
export type SyncRange = ContractCalendarDetail["syncFutureRange"];
export type KeeperEvent = ContractEvent;
export type PendingInvite = ContractPendingInvite;
export type SyncDestinationStatus = ContractSyncDestinationStatus;
export type Entitlements = ContractEntitlements;
export type ApiToken = ContractApiToken;

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function getErrorMessage(
  value: unknown,
  fallback = "Something went wrong.",
): string {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === "object") {
    const body = value as { error?: unknown; message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  }
  return fallback;
}
