import type { ListingScope, TimeWindow } from "@keeper.sh/sync-protocol";
import type { ListingMode } from "../cursor/fingerprint";

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

const selectedFields = (): string => instancesSelect.join(",");

const spanParameters = (bounds: TimeWindow): Readonly<Record<string, string>> => ({
  startDateTime: bounds.start.value,
  endDateTime: bounds.end.value,
});

const requestParameters = (
  scope: ListingScope,
  mode: ListingMode,
): Readonly<Record<string, string>> => {
  if (mode === "delta") {
    return { $select: selectedFields() };
  }
  const { window: bounds } = scope;
  return { ...spanParameters(bounds), $select: selectedFields() };
};

const instancesParameters = (scope: ListingScope): Readonly<Record<string, string>> => {
  const { window: bounds } = scope;
  return { ...spanParameters(bounds), $select: selectedFields() };
};

export {
  calendarViewSelect,
  instancesParameters,
  instancesSelect,
  requestParameters,
  requestPaths,
};
export type { RequestPath };
