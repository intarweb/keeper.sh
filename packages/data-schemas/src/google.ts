import { type } from "arktype";

const googleEventSchema = type({
  "description?": "string",
  "end?": { "date?": "string", "dateTime?": "string", "timeZone?": "string" },
  "eventType?": "string",
  "iCalUID?": "string",
  "id?": "string",
  "location?": "string",
  "recurrence?": "string[]",
  "start?": { "date?": "string", "dateTime?": "string", "timeZone?": "string" },
  "status?": "'confirmed' | 'tentative' | 'cancelled'",
  "summary?": "string",
  "transparency?": "string",
  "visibility?": "string",
  "workingLocationProperties?": {
    "customLocation?": { "label?": "string" },
    "homeOffice?": "unknown",
    "officeLocation?": { "buildingId?": "string", "deskId?": "string", "floorId?": "string", "floorSectionId?": "string", "label?": "string" },
    "type?": "string",
  },
});
type GoogleEvent = typeof googleEventSchema.infer;

const googleEventListSchema = type({
  "items?": googleEventSchema.array(),
  "nextPageToken?": "string",
  "nextSyncToken?": "string",
});
type GoogleEventList = typeof googleEventListSchema.infer;

const googleAttendeeSchema = type({
  "email?": "string",
  "responseStatus?": "string",
  "self?": "boolean",
});
type GoogleAttendee = typeof googleAttendeeSchema.infer;

const googleEventWithAttendeesSchema = googleEventSchema.and({
  "attendees?": googleAttendeeSchema.array(),
  "organizer?": { "email?": "string", "displayName?": "string" },
});
type GoogleEventWithAttendees = typeof googleEventWithAttendeesSchema.infer;

const googleEventWithAttendeesListSchema = type({
  "items?": googleEventWithAttendeesSchema.array(),
  "nextPageToken?": "string",
});
type GoogleEventWithAttendeesList = typeof googleEventWithAttendeesListSchema.infer;

const googleApiErrorSchema = type({
  "error?": {
    "code?": "number",
    "message?": "string",
    "status?": "string",
    "errors?": type({ "reason?": "string" }).array(),
    "details?": type({ "reason?": "string" }).array(),
  },
});
type GoogleApiError = typeof googleApiErrorSchema.infer;

const googleTokenResponseSchema = type({
  access_token: "string",
  expires_in: "number",
  "refresh_token?": "string",
  scope: "string",
  token_type: "string",
});
type GoogleTokenResponse = typeof googleTokenResponseSchema.infer;

const googleUserInfoSchema = type({
  email: "string",
  "family_name?": "string",
  "given_name?": "string",
  id: "string",
  "name?": "string",
  "picture?": "string",
  "verified_email?": "boolean",
});
type GoogleUserInfo = typeof googleUserInfoSchema.infer;

const googleCalendarListEntrySchema = type({
  accessRole: "'freeBusyReader' | 'reader' | 'writer' | 'owner'",
  "backgroundColor?": "string",
  "description?": "string",
  "foregroundColor?": "string",
  id: "string",
  "primary?": "boolean",
  "summary?": "string",
});
type GoogleCalendarListEntry = typeof googleCalendarListEntrySchema.infer;

/*
 * Google omits empty arrays, and entries are validated one by one so an unusual calendar
 * costs that calendar rather than the whole account.
 */
const googleCalendarListResponseSchema = type({
  "items?": "unknown[]",
  kind: "'calendar#calendarList'",
  "nextPageToken?": "string",
});
type GoogleCalendarListResponse = typeof googleCalendarListResponseSchema.infer;

const googleWatchHeadersSchema = type({
  channelId: "string",
  token: "string",
  "messageNumber?": "string",
  "resourceId?": "string",
  "resourceState?": "string",
});
type GoogleWatchHeaders = typeof googleWatchHeadersSchema.infer;

export {
  googleApiErrorSchema,
  googleAttendeeSchema,
  googleCalendarListEntrySchema,
  googleCalendarListResponseSchema,
  googleEventListSchema,
  googleEventSchema,
  googleEventWithAttendeesListSchema,
  googleEventWithAttendeesSchema,
  googleTokenResponseSchema,
  googleUserInfoSchema,
  googleWatchHeadersSchema,
};

export type {
  GoogleApiError,
  GoogleAttendee,
  GoogleCalendarListEntry,
  GoogleCalendarListResponse,
  GoogleEvent,
  GoogleEventList,
  GoogleEventWithAttendees,
  GoogleEventWithAttendeesList,
  GoogleTokenResponse,
  GoogleUserInfo,
  GoogleWatchHeaders,
};
