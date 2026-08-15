import { type } from "arktype";

const microsoftTokenResponseSchema = type({
  access_token: "string",
  expires_in: "number",
  "refresh_token?": "string",
  scope: "string",
  token_type: "string",
});
type MicrosoftTokenResponse = typeof microsoftTokenResponseSchema.infer;

const microsoftUserInfoSchema = type({
  "displayName?": "string",
  id: "string",
  "mail?": "string | null",
  "userPrincipalName?": "string",
});
type MicrosoftUserInfo = typeof microsoftUserInfoSchema.infer;

const outlookEventSchema = type({
  "@removed?": { "reason?": "'deleted' | 'changed'" },
  "body?": type({ "content?": "string", "contentType?": "string" }).or(type("null")),
  "categories?": "string[]",
  "createdDateTime?": "string",
  "end?": { "dateTime?": "string", "timeZone?": "string" },
  "iCalUId?": "string | null",
  "id?": "string",
  "isAllDay?": "boolean",
  "isCancelled?": "boolean",
  "lastModifiedDateTime?": "string",
  "location?": { "displayName?": "string" },
  "originalEndTimeZone?": "string",
  "originalStartTimeZone?": "string",
  "showAs?": "string",
  "start?": { "dateTime?": "string", "timeZone?": "string" },
  "subject?": "string | null",
  "seriesMasterId?": "string | null",
  "type?": "string",
});
type OutlookEvent = typeof outlookEventSchema.infer;

const outlookEventListSchema = type({
  "@odata.deltaLink?": "string",
  "@odata.nextLink?": "string",
  "value?": outlookEventSchema.array(),
});
type OutlookEventList = typeof outlookEventListSchema.infer;

const outlookCalendarViewEventSchema = type({
  "id?": "string",
  "iCalUId?": "string | null",
  "subject?": "string | null",
  "bodyPreview?": "string",
  "location?": { "displayName?": "string" },
  "start?": { "dateTime?": "string", "timeZone?": "string" },
  "end?": { "dateTime?": "string", "timeZone?": "string" },
  "isAllDay?": "boolean",
  "responseStatus?": { "response?": "string" },
  "organizer?": { "emailAddress?": { "address?": "string", "name?": "string" } },
});
type OutlookCalendarViewEvent = typeof outlookCalendarViewEventSchema.infer;

const outlookCalendarViewListSchema = type({
  "value?": outlookCalendarViewEventSchema.array(),
  "@odata.nextLink?": "string",
});
type OutlookCalendarViewList = typeof outlookCalendarViewListSchema.infer;

const microsoftApiErrorSchema = type({
  "error?": { "code?": "string", "message?": "string" },
});
type MicrosoftApiError = typeof microsoftApiErrorSchema.infer;

const graphNotificationSchema = type({
  subscriptionId: "string",
  "changeType?": "string",
  "clientState?": "string | null",
  "id?": "string",
  "lifecycleEvent?": "string",
  "resource?": "string",
  "resourceData?": "unknown",
  "subscriptionExpirationDateTime?": "string",
  "tenantId?": "string",
});
type GraphNotification = typeof graphNotificationSchema.infer;

const graphNotificationCollectionSchema = type({
  value: graphNotificationSchema.array(),
});
type GraphNotificationCollection = typeof graphNotificationCollectionSchema.infer;

export {
  graphNotificationCollectionSchema,
  graphNotificationSchema,
  microsoftApiErrorSchema,
  microsoftTokenResponseSchema,
  microsoftUserInfoSchema,
  outlookCalendarViewEventSchema,
  outlookCalendarViewListSchema,
  outlookEventListSchema,
  outlookEventSchema,
};

export type {
  GraphNotification,
  GraphNotificationCollection,
  MicrosoftApiError,
  MicrosoftTokenResponse,
  MicrosoftUserInfo,
  OutlookCalendarViewEvent,
  OutlookCalendarViewList,
  OutlookEvent,
  OutlookEventList,
};
