import type { ListingScope } from "@keeper.sh/sync-protocol";
import type { ListingMode } from "../cursor/fingerprint";
import { unimplemented } from "../unimplemented";

const calendarViewSelect = [
  "id",
  "iCalUId",
  "subject",
  "body",
  "bodyPreview",
  "location",
  "start",
  "end",
  "isAllDay",
  "isCancelled",
  "showAs",
  "sensitivity",
  "type",
  "seriesMasterId",
  "originalStartTimeZone",
  "originalEndTimeZone",
  "recurrence",
  "onlineMeeting",
  "categories",
  "lastModifiedDateTime",
  "createdDateTime",
  "changeKey",
] as const;

const instancesSelect = calendarViewSelect;

const requestPaths = {
  calendarView: "calendarView",
  delta: "calendarView/delta",
  instances: "instances",
} as const;

type RequestPath = (typeof requestPaths)[keyof typeof requestPaths];

const requestParameters = (
  scope: ListingScope,
  mode: ListingMode,
): Readonly<Record<string, string>> => unimplemented(scope, mode);

const instancesParameters = (scope: ListingScope): Readonly<Record<string, string>> =>
  unimplemented(scope);

export {
  calendarViewSelect,
  instancesParameters,
  instancesSelect,
  requestParameters,
  requestPaths,
};
export type { RequestPath };
