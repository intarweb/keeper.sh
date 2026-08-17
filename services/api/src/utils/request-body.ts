/** Shared, runtime-safe request contracts consumed by every first-party client. */
export {
  apiTokenCreateSchema as tokenCreateBodySchema,
  calendarIdsRequestSchema as calendarIdsBodySchema,
  calendarPatchSchema as sourcePatchBodySchema,
  calendarPauseRequestSchema as calendarPausePatchBodySchema,
  eventCreateSchema as eventCreateBodySchema,
  eventPatchSchema as eventPatchBodySchema,
  icalSettingsPatchSchema as icalSettingsPatchBodySchema,
} from "@keeper.sh/api-contracts";

export type {
  ApiTokenCreate as TokenCreateBody,
  CalendarIdsRequest as CalendarIdsBody,
  CalendarPatch as SourcePatchBody,
  EventCreate as EventCreateBody,
  EventPatch as EventPatchBody,
  IcalSettingsPatch as IcalSettingsPatchBody,
} from "@keeper.sh/api-contracts";
