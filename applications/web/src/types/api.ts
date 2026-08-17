/**
 * Compatibility exports while web call sites migrate incrementally to the shared
 * runtime-validated API boundary used by web and native clients.
 */
export type {
  Account as CalendarAccount,
  CalendarDetail,
  CalendarSource,
  Event as ApiEvent,
  EventSummary as ApiEventSummary,
} from "@keeper.sh/api-contracts";
