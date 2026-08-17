import { type } from "arktype";
import {
  authCapabilitiesSchema,
  feedbackRequestSchema,
  planSchema,
  syncAggregateSchema,
  syncRangeSchema,
  userSchema,
} from "@keeper.sh/data-schemas";

/** A deliberately small structural interface usable by fetch clients without coupling to ArkType internals. */
interface ContractSchema<Output> {
  assert(value: unknown): Output;
  allows(value: unknown): value is Output;
}

const nullableString = type("string | null");
const optionalNullableString = "string | null" as const;
const successSchema = type({ success: "boolean", "+": "reject" });
const idResultSchema = type({ id: "string", "+": "reject" });
const errorResponseSchema = type({
  error: "string | null",
  "code?": "string",
  "details?": "unknown",
});
const paginationSchema = type({
  "cursor?": "string | null",
  "hasMore?": "boolean",
  "limit?": "number",
  "nextCursor?": "string | null",
  "+": "reject",
});
const throttleSchema = type({
  retryAfterSeconds: "number",
  throttled: "true",
  "+": "reject",
});

const sessionUserSchema = userSchema.and({
  "image?": "string | null",
});
const safeSessionSchema = type({
  user: sessionUserSchema,
  session: {
    id: "string",
    userId: "string",
    expiresAt: "string | Date",
    "createdAt?": "string | Date",
    "updatedAt?": "string | Date",
  },
});
const safeSessionResponseSchema = type({
  "user?": sessionUserSchema.or("null"),
  "session?": safeSessionSchema.get("session").or("null"),
}).or("null");

const accountSchema = type({
  id: "string",
  provider: "string",
  providerName: "string",
  providerIcon: optionalNullableString,
  displayName: optionalNullableString,
  email: optionalNullableString,
  accountLabel: "string",
  accountIdentifier: "string",
  authType: "string",
  needsReauthentication: "boolean",
  calendarCount: "number",
  createdAt: "string",
  "+": "reject",
});
const accountListSchema = accountSchema.array();

const calendarSourceSchema = type({
  id: "string",
  name: "string",
  calendarType: "string",
  capabilities: "string[]",
  accountId: "string",
  provider: "string",
  providerName: "string",
  providerIcon: optionalNullableString,
  displayName: optionalNullableString,
  email: optionalNullableString,
  accountLabel: "string",
  accountIdentifier: "string",
  needsReauthentication: "boolean",
  includeInIcalFeed: "boolean",
  disabled: "boolean",
  "+": "reject",
});
const calendarSourceListSchema = calendarSourceSchema.array();
const calendarSourceReadSchema = type({
  id: "string",
  name: "string",
  calendarType: "string",
  capabilities: "string[]",
  accountId: "string",
  provider: "string",
  providerName: "string",
  providerIcon: optionalNullableString,
  displayName: optionalNullableString,
  email: optionalNullableString,
  accountLabel: "string",
  accountIdentifier: "string",
  needsReauthentication: "boolean",
  includeInIcalFeed: "boolean",
  "disabled?": "boolean",
  "+": "reject",
}).pipe((calendar) => ({ ...calendar, disabled: calendar.disabled ?? false }));
const calendarSourceReadListSchema = calendarSourceReadSchema.array();

const calendarDetailSchema = type({
  id: "string",
  name: "string",
  originalName: optionalNullableString,
  calendarType: "string",
  capabilities: "string[]",
  provider: "string",
  providerName: "string",
  providerIcon: optionalNullableString,
  url: optionalNullableString,
  calendarUrl: optionalNullableString,
  customEventName: "string",
  excludeAllDayEvents: "boolean",
  excludeEventDescription: "boolean",
  excludeEventLocation: "boolean",
  excludeEventName: "boolean",
  excludeFocusTime: "boolean",
  excludeOutOfOffice: "boolean",
  treatFullDayTimedEventsAsAllDay: "boolean",
  disabled: "boolean",
  syncFutureRange: syncRangeSchema,
  syncHistoricRange: syncRangeSchema,
  destinationIds: "string[]",
  sourceIds: "string[]",
  createdAt: "string",
  updatedAt: "string",
  "+": "reject",
});
const calendarPatchSchema = type({
  "name?": "string",
  "customEventName?": "string",
  "excludeAllDayEvents?": "boolean",
  "excludeEventDescription?": "boolean",
  "excludeEventLocation?": "boolean",
  "excludeEventName?": "boolean",
  "excludeFocusTime?": "boolean",
  "excludeOutOfOffice?": "boolean",
  "includeInIcalFeed?": "boolean",
  "treatFullDayTimedEventsAsAllDay?": "boolean",
  "syncHistoricRange?": syncRangeSchema,
  "syncFutureRange?": syncRangeSchema,
  "+": "reject",
}).narrow((value, ctx) => Object.keys(value).length > 0
  || ctx.mustBe("at least one calendar setting"));
const compactCalendarSchema = type({
  id: "string",
  name: "string",
  provider: "string",
  account: "string",
  disabled: "boolean",
  "+": "reject",
});
const compactCalendarListSchema = compactCalendarSchema.array();
const calendarPauseRequestSchema = type({ paused: "boolean", "+": "reject" });
const calendarPauseResultSchema = type({
  calendarId: "string",
  paused: "boolean",
  "+": "reject",
});

const mappingSchema = type({
  id: "string",
  sourceCalendarId: "string",
  destinationCalendarId: "string",
  createdAt: "string",
  calendarType: "string",
  "+": "reject",
});
const mappingListSchema = mappingSchema.array();
const calendarIdsRequestSchema = type({ calendarIds: "string[]", "+": "reject" });
const destinationIdsResponseSchema = type({ destinationIds: "string[]", "+": "reject" });
const sourceIdsResponseSchema = type({ sourceIds: "string[]", "+": "reject" });

const entitlementLimitSchema = type({ current: "number", limit: "number | null", "+": "reject" });
const entitlementsSchema = type({
  plan: planSchema,
  accounts: entitlementLimitSchema,
  mappings: entitlementLimitSchema,
  canCustomizeIcalFeed: "boolean",
  canUseEventFilters: "boolean",
  "+": "reject",
});
const entitlementsReadSchema = type({
  plan: planSchema,
  accounts: entitlementLimitSchema,
  mappings: entitlementLimitSchema,
  canCustomizeIcalFeed: "boolean",
  canUseEventFilters: "boolean",
  "feeds?": entitlementLimitSchema,
  "+": "reject",
}).pipe(({ feeds: _feeds, ...entitlements }) => entitlements);
const subscriptionStateSchema = type({
  plan: planSchema,
  interval: "'month' | 'year' | null",
  "+": "reject",
});
const customerStateSchema = type({
  activeSubscriptions: type({ "recurringInterval?": "'month' | 'year' | null" }).array().or("null"),
});

const eventSchema = type({
  id: "string",
  eventStateId: nullableString,
  startTime: "string",
  endTime: "string",
  title: nullableString,
  description: nullableString,
  location: nullableString,
  calendarId: "string",
  calendarName: "string",
  calendarProvider: "string",
  calendarUrl: nullableString,
  availability: "'busy' | 'free'",
  isAllDay: "boolean",
  "+": "reject",
});
const eventListSchema = eventSchema.array();
const eventReadSchema = type({
  id: "string",
  eventStateId: nullableString,
  startTime: "string",
  endTime: "string",
  title: nullableString,
  description: nullableString,
  location: nullableString,
  calendarId: "string",
  calendarName: "string",
  calendarProvider: "string",
  calendarUrl: nullableString,
  "availability?": "'busy' | 'free'",
  "isAllDay?": "boolean",
  "+": "reject",
}).pipe((event) => ({
  ...event,
  availability: event.availability ?? "busy" as const,
  isAllDay: event.isAllDay ?? false,
}));
const eventReadListSchema = eventReadSchema.array();
const eventSummarySchema = type({ id: "string", startTime: "string", "+": "reject" });
const eventCountSchema = type({ count: "number", "+": "reject" });
const availabilitySchema = type("'busy' | 'free'");
const rsvpStatusSchema = type("'accepted' | 'declined' | 'tentative'");
const eventCreateSchema = type({
  calendarId: "string",
  title: "string",
  "description?": "string",
  "location?": "string",
  startTime: "string",
  endTime: "string",
  "isAllDay?": "boolean",
  "availability?": availabilitySchema,
  "timezone?": "string",
  "+": "reject",
});
const eventPatchSchema = type({
  "title?": "string",
  "description?": "string",
  "location?": "string",
  "startTime?": "string",
  "endTime?": "string",
  "isAllDay?": "boolean",
  "availability?": availabilitySchema,
  "timezone?": "string",
  "rsvpStatus?": rsvpStatusSchema,
  "+": "reject",
});
const rsvpResultSchema = type({ rsvpStatus: rsvpStatusSchema, "+": "reject" });
const inviteRsvpRequestSchema = type({
  rsvpStatus: rsvpStatusSchema,
  "occurrenceStart?": "string",
  "sourceEventId?": "string",
  "+": "reject",
});
const pendingInviteSchema = type({
  sourceEventId: nullableString,
  sourceEventUid: "string",
  title: nullableString,
  description: nullableString,
  location: nullableString,
  startTime: "string",
  endTime: "string",
  isAllDay: "boolean",
  organizer: nullableString,
  calendarId: "string",
  provider: "string",
  "+": "reject",
});
const pendingInviteListSchema = pendingInviteSchema.array();
const workingHoursSchema = type({
  startMinute: "number",
  endMinute: "number",
  days: "number[] | null",
  "+": "reject",
});
const freeTimeQuerySchema = type({
  from: "string",
  to: "string",
  durationMinutes: "number",
  timezone: "string",
  "calendarId?": "string[]",
  "workingHours?": workingHoursSchema.or("null"),
  "ignoreAllDayEvents?": "boolean",
  "limit?": "number",
  "+": "reject",
});
const freeSlotSchema = type({
  start: "string",
  end: "string",
  durationMinutes: "number",
  "+": "reject",
});
const freeTimeResultSchema = type({
  from: "string",
  to: "string",
  timezone: "string",
  durationMinutes: "number",
  slots: freeSlotSchema.array(),
  "+": "reject",
});

const icalSettingsSchema = type({
  userId: "string",
  includeEventName: "boolean",
  includeEventDescription: "boolean",
  includeEventLocation: "boolean",
  excludeAllDayEvents: "boolean",
  customEventName: "string",
  "updatedAt?": "string",
  "+": "reject",
});
const icalSettingsPatchSchema = type({
  "includeEventName?": "boolean",
  "includeEventDescription?": "boolean",
  "includeEventLocation?": "boolean",
  "excludeAllDayEvents?": "boolean",
  "customEventName?": "string",
  "+": "reject",
}).narrow((value, ctx) => Object.keys(value).length > 0
  || ctx.mustBe("at least one iCal setting"));
const icalTokenSchema = type({ icalUrl: "string | null", token: "string", "+": "reject" });
const v1IcalSchema = type({ url: "string", "+": "reject" });

const apiTokenSchema = type({
  id: "string",
  name: "string",
  tokenPrefix: "string",
  lastUsedAt: "string | null",
  expiresAt: "string | null",
  createdAt: "string",
  "+": "reject",
});
const apiTokenListSchema = apiTokenSchema.array();
const apiTokenCreateSchema = type({ name: "string", "+": "reject" }).narrow(
  (value, ctx) => value.name.trim().length > 0 || ctx.mustBe("a non-empty token name"),
);
const apiTokenCreatedSchema = type({
  id: "string",
  name: "string",
  tokenPrefix: "string",
  token: "string",
  createdAt: "string",
  "+": "reject",
});

const feedbackResultSchema = successSchema;

const caldavDiscoveryRequestSchema = type({
  serverUrl: "string",
  username: "string",
  password: "string",
  "+": "reject",
});
const discoveredCalendarSchema = type({
  url: "string",
  displayName: "string",
  "ctag?": "string",
  "+": "reject",
});
const caldavAuthMethodSchema = type("'basic' | 'digest'");
const caldavDiscoveryResultSchema = type({
  calendars: discoveredCalendarSchema.array(),
  authMethod: caldavAuthMethodSchema,
  "+": "reject",
});
const caldavConnectRequestSchema = type({
  calendarUrl: "string",
  password: "string",
  "provider?": "string",
  serverUrl: "string",
  username: "string",
  "+": "reject",
});
const remoteIcsCreateSchema = type({
  name: "string",
  "password?": "string",
  url: "string",
  "username?": "string",
  "+": "reject",
}).narrow((value, ctx) =>
  Boolean(value.username) === Boolean(value.password)
  || ctx.mustBe("username and password together"));
const calendarRecordSchema = type({
  accountId: "string",
  calendarType: "string",
  calendarUrl: nullableString,
  createdAt: "string",
  excludeAllDayEvents: "boolean",
  excludeEventDescription: "boolean",
  excludeEventLocation: "boolean",
  excludeEventName: "boolean",
  excludeFocusTime: "boolean",
  excludeOutOfOffice: "boolean",
  includeInIcalFeed: "boolean",
  treatFullDayTimedEventsAsAllDay: "boolean",
  customEventName: "string",
  disabled: "boolean",
  failureCount: "number",
  lastFailureAt: nullableString,
  nextAttemptAt: nullableString,
  ingestFailureCount: "number",
  ingestLastFailureAt: nullableString,
  ingestNextAttemptAt: nullableString,
  ingestFutureRange: "string",
  ingestHistoricRange: "string",
  ingestWindowEnd: nullableString,
  ingestWindowRecordedAt: nullableString,
  ingestWindowStart: nullableString,
  externalCalendarId: nullableString,
  id: "string",
  capabilities: "string[]",
  name: "string",
  originalName: nullableString,
  syncToken: nullableString,
  syncFutureRange: "string",
  syncHistoricRange: "string",
  updatedAt: "string",
  url: nullableString,
  userId: "string",
  "+": "reject",
});
const remoteIcsListSchema = calendarRecordSchema.array();
const oauthSourceSchema = type({
  email: nullableString,
  id: "string",
  name: "string",
  provider: "string",
  "+": "reject",
});
const oauthSourceListSchema = oauthSourceSchema.array();
const oauthSourceCreateSchema = type({
  "destinationId?": "string",
  externalCalendarId: "string",
  name: "string",
  "oauthSourceCredentialId?": "string",
  "syncFocusTime?": "boolean",
  "syncOutOfOffice?": "boolean",
  "+": "reject",
});
const caldavSourceCreateSchema = type({
  authMethod: "'basic' | 'digest'",
  calendarUrl: "string",
  name: "string",
  password: "string",
  provider: "'caldav' | 'fastmail' | 'icloud'",
  serverUrl: "string",
  username: "string",
  "+": "reject",
});
const caldavSourceSchema = type({
  id: "string",
  accountId: "string",
  userId: "string",
  name: "string",
  provider: "string",
  calendarUrl: "string",
  serverUrl: "string",
  username: "string",
  createdAt: "string",
  "+": "reject",
});
const caldavSourceListSchema = caldavSourceSchema.array();
const destinationSchema = type({
  id: "string",
  provider: "string",
  email: nullableString,
  needsReauthentication: "boolean",
  "+": "reject",
});
const destinationListSchema = destinationSchema.array();
const providerCalendarSchema = type({
  id: "string",
  summary: "string",
  "primary?": "boolean",
  "+": "reject",
});
const providerCalendarListSchema = type({
  calendars: providerCalendarSchema.array(),
  "+": "reject",
});
const remoteIcsFailureSchema = type({
  authRequired: "boolean",
  error: "string",
  "+": "reject",
});
const providerAuthorizeQuerySchema = type({
  provider: "string",
  "credentialId?": "string",
  "destinationId?": "string",
  "returnTo?": "string",
  "+": "reject",
}).narrow((value, ctx) => !value.returnTo || value.returnTo.length <= 2048
  || ctx.mustBe("a returnTo URL no longer than 2048 characters"));
const providerConnectResultSchema = type({
  "accountId?": "string",
  "calendarId?": "string",
  "credentialId?": "string",
  "destinationId?": "string",
  "success?": "boolean",
});
const oauthCallbackStateSchema = type({ credentialId: "string", provider: "string", "+": "reject" });

const syncDestinationStatusSchema = type({
  calendarId: "string",
  inSync: "boolean",
  lastSyncedAt: "string | null",
  localEventCount: "number",
  remoteEventCount: "number",
  "+": "reject",
});
const syncStatusResponseSchema = type({
  destinations: syncDestinationStatusSchema.array(),
  "+": "reject",
});
const syncTriggerResultSchema = type({
  triggered: "boolean",
  sourcesRefreshed: "number",
  "+": "reject",
});
const socketUrlSchema = type({
  "socketUrl?": "string",
  "socketPath?": "string",
  "+": "reject",
}).narrow((value, ctx) => {
  if (value.socketUrl || value.socketPath) {
    return true;
  }
  return ctx.mustBe("an object containing socketUrl or socketPath");
});
const socketTokenSchema = type({ token: "string", "+": "reject" });
const syncSocketMessageSchema = type({
  event: "'sync:aggregate'",
  data: syncAggregateSchema,
  "+": "reject",
});
const genericSocketMessageSchema = type({ event: "string", "data?": "unknown" }).narrow(
  (value, ctx) => value.event !== "sync:aggregate"
    || ctx.mustBe("a sync:aggregate payload matching syncSocketMessageSchema"),
);
const socketPayloadSchema = syncSocketMessageSchema.or(genericSocketMessageSchema);
const eventCreatedMarkerSchema = type({ created: "true", "+": "reject" });
const eventCreateResultSchema = eventSchema.or(eventCreatedMarkerSchema);
const eventUpdateResultSchema = eventSchema.or("null");

const mobilePlatformSchema = type("'android' | 'ios'");
const deviceRegistrationSchema = type({
  installationId: "string",
  platform: mobilePlatformSchema,
  "pushToken?": "string | null",
  "deviceName?": "string",
  "appVersion?": "string",
  "+": "reject",
}).narrow((value, ctx) => {
  if (!value.installationId.trim()) {
    return ctx.mustBe("a non-empty installationId");
  }
  if (value.installationId.length > 256) {
    return ctx.mustBe("an installationId no longer than 256 characters");
  }
  if ((value.appVersion?.length ?? 0) > 128) {
    return ctx.mustBe("an appVersion no longer than 128 characters");
  }
  if ((value.deviceName?.length ?? 0) > 256) {
    return ctx.mustBe("a deviceName no longer than 256 characters");
  }
  if (value.pushToken && value.pushToken.length > 4096) {
    return ctx.mustBe("a pushToken no longer than 4096 characters");
  }
  return true;
});
const deviceRegistrationResultSchema = type({ installationId: "string", "+": "reject" });
const deviceInstallationSchema = type({
  appVersion: nullableString,
  createdAt: "string",
  deviceName: nullableString,
  enabled: "boolean",
  installationId: "string",
  lastSeenAt: "string",
  platform: "string",
  "+": "reject",
});
const deviceInstallationListSchema = deviceInstallationSchema.array();
const notificationPreferencesSchema = type({
  invites: "boolean",
  reauthentication: "boolean",
  syncFailures: "boolean",
  "+": "reject",
});
const notificationPreferencesPatchSchema = type({
  "invites?": "boolean",
  "reauthentication?": "boolean",
  "syncFailures?": "boolean",
  "+": "reject",
}).narrow((value, ctx) => Object.keys(value).length > 0
  || ctx.mustBe("at least one notification preference"));
const oauthReauthenticationRecoverySchema = type({
  authorizePath: "string",
  method: "'GET'",
  "+": "reject",
});
const caldavReauthenticationRecoverySchema = type({
    accountId: "string",
    connectPath: "'/api/destinations/caldav'",
    method: "'POST'",
    "+": "reject",
});
const reauthenticationRecoverySchema = oauthReauthenticationRecoverySchema.or(
  caldavReauthenticationRecoverySchema,
);
const reauthenticationAccountSchema = type({
  authType: "string",
  accountIdentifier: "string",
  displayName: nullableString,
  email: nullableString,
  id: "string",
  provider: "string",
  reauthenticationSource: nullableString,
  providerName: "string",
  providerIcon: nullableString,
  accountLabel: "string",
  needsReauthentication: "true",
  recovery: reauthenticationRecoverySchema,
  "+": "reject",
});
const reauthenticationAccountListSchema = reauthenticationAccountSchema.array();
const oauthTicketRedeemSchema = type({ ticket: "string", "+": "reject" }).narrow(
  (value, ctx) => (value.ticket.length > 0 && value.ticket.length <= 1024)
    || ctx.mustBe("a non-empty OAuth ticket no longer than 1024 characters"),
);
const oauthTicketResultSchema = type({
  flow: "'destination' | 'source'",
  provider: "string",
  "resourceId?": "string",
  status: "'cancelled' | 'error' | 'success'",
  "errorCode?": "string",
  expiresAt: "number",
  "+": "reject",
}).narrow((value, ctx) => (
  value.provider.length <= 128
  && (value.resourceId?.length ?? 0) <= 512
  && (value.errorCode?.length ?? 0) <= 128
) || ctx.mustBe("bounded OAuth ticket result fields"));
const planManagementSchema = type({ url: "string | null", "+": "reject" });

type AuthCapabilities = typeof authCapabilitiesSchema.infer;
type FeedbackRequest = typeof feedbackRequestSchema.infer;
type SafeSession = typeof safeSessionSchema.infer;
type SafeSessionResponse = typeof safeSessionResponseSchema.infer;
type Account = typeof accountSchema.infer;
type CalendarSource = typeof calendarSourceSchema.infer;
type CalendarDetail = typeof calendarDetailSchema.infer;
type CalendarPatch = typeof calendarPatchSchema.infer;
type CompactCalendar = typeof compactCalendarSchema.infer;
type CalendarPauseRequest = typeof calendarPauseRequestSchema.infer;
type CalendarPauseResult = typeof calendarPauseResultSchema.infer;
type Mapping = typeof mappingSchema.infer;
type CalendarIdsRequest = typeof calendarIdsRequestSchema.infer;
type Entitlements = typeof entitlementsSchema.infer;
type EntitlementLimit = typeof entitlementLimitSchema.infer;
type SubscriptionState = typeof subscriptionStateSchema.infer;
type CustomerState = typeof customerStateSchema.infer;
type Event = typeof eventSchema.infer;
type EventSummary = typeof eventSummarySchema.infer;
type EventCreate = typeof eventCreateSchema.infer;
type EventPatch = typeof eventPatchSchema.infer;
type PendingInvite = typeof pendingInviteSchema.infer;
type RsvpStatus = typeof rsvpStatusSchema.infer;
type WorkingHours = typeof workingHoursSchema.infer;
type FreeTimeQuery = typeof freeTimeQuerySchema.infer;
type FreeSlot = typeof freeSlotSchema.infer;
type FreeTimeResult = typeof freeTimeResultSchema.infer;
type IcalSettings = typeof icalSettingsSchema.infer;
type IcalSettingsPatch = typeof icalSettingsPatchSchema.infer;
type ApiToken = typeof apiTokenSchema.infer;
type ApiTokenCreate = typeof apiTokenCreateSchema.infer;
type ApiTokenCreated = typeof apiTokenCreatedSchema.infer;
type CaldavDiscoveryRequest = typeof caldavDiscoveryRequestSchema.infer;
type CaldavDiscoveryResult = typeof caldavDiscoveryResultSchema.infer;
type CaldavConnectRequest = typeof caldavConnectRequestSchema.infer;
type RemoteIcsCreate = typeof remoteIcsCreateSchema.infer;
type CalendarRecord = typeof calendarRecordSchema.infer;
type OAuthSource = typeof oauthSourceSchema.infer;
type OAuthSourceCreate = typeof oauthSourceCreateSchema.infer;
type CaldavSource = typeof caldavSourceSchema.infer;
type CaldavSourceCreate = typeof caldavSourceCreateSchema.infer;
type Destination = typeof destinationSchema.infer;
type ProviderCalendar = typeof providerCalendarSchema.infer;
type MobilePlatform = typeof mobilePlatformSchema.infer;
type DeviceRegistration = typeof deviceRegistrationSchema.infer;
type DeviceInstallation = typeof deviceInstallationSchema.infer;
type NotificationPreferences = typeof notificationPreferencesSchema.infer;
type NotificationPreferencesPatch = typeof notificationPreferencesPatchSchema.infer;
type ReauthenticationAccount = typeof reauthenticationAccountSchema.infer;
type OAuthTicketResult = typeof oauthTicketResultSchema.infer;
type InviteRsvpRequest = typeof inviteRsvpRequestSchema.infer;
type ProviderAuthorizeQuery = typeof providerAuthorizeQuerySchema.infer;
type ProviderConnectResult = typeof providerConnectResultSchema.infer;
type SyncDestinationStatus = typeof syncDestinationStatusSchema.infer;
type SyncTriggerResult = typeof syncTriggerResultSchema.infer;
type SocketUrl = typeof socketUrlSchema.infer;
type SocketPayload = typeof socketPayloadSchema.infer;
type ApiErrorBody = typeof errorResponseSchema.infer;
type Pagination = typeof paginationSchema.infer;
type Throttle = typeof throttleSchema.infer;

export {
  accountListSchema,
  accountSchema,
  apiTokenCreateSchema,
  apiTokenCreatedSchema,
  apiTokenListSchema,
  apiTokenSchema,
  authCapabilitiesSchema,
  availabilitySchema,
  caldavConnectRequestSchema,
  caldavAuthMethodSchema,
  caldavReauthenticationRecoverySchema,
  caldavSourceCreateSchema,
  caldavSourceListSchema,
  caldavSourceSchema,
  caldavDiscoveryRequestSchema,
  caldavDiscoveryResultSchema,
  calendarDetailSchema,
  calendarRecordSchema,
  calendarIdsRequestSchema,
  calendarPatchSchema,
  calendarPauseRequestSchema,
  calendarPauseResultSchema,
  calendarSourceListSchema,
  calendarSourceReadListSchema,
  calendarSourceReadSchema,
  calendarSourceSchema,
  compactCalendarListSchema,
  compactCalendarSchema,
  customerStateSchema,
  destinationIdsResponseSchema,
  destinationListSchema,
  destinationSchema,
  deviceInstallationListSchema,
  deviceInstallationSchema,
  deviceRegistrationResultSchema,
  deviceRegistrationSchema,
  discoveredCalendarSchema,
  entitlementLimitSchema,
  entitlementsSchema,
  entitlementsReadSchema,
  errorResponseSchema,
  eventCountSchema,
  eventCreateSchema,
  eventCreateResultSchema,
  eventCreatedMarkerSchema,
  eventListSchema,
  eventReadListSchema,
  eventReadSchema,
  eventPatchSchema,
  eventSchema,
  eventSummarySchema,
  eventUpdateResultSchema,
  feedbackRequestSchema,
  feedbackResultSchema,
  freeSlotSchema,
  freeTimeQuerySchema,
  freeTimeResultSchema,
  genericSocketMessageSchema,
  icalSettingsPatchSchema,
  icalSettingsSchema,
  icalTokenSchema,
  idResultSchema,
  inviteRsvpRequestSchema,
  mappingListSchema,
  mappingSchema,
  mobilePlatformSchema,
  notificationPreferencesPatchSchema,
  notificationPreferencesSchema,
  oauthCallbackStateSchema,
  oauthReauthenticationRecoverySchema,
  oauthSourceCreateSchema,
  oauthSourceListSchema,
  oauthSourceSchema,
  oauthTicketRedeemSchema,
  oauthTicketResultSchema,
  paginationSchema,
  pendingInviteListSchema,
  pendingInviteSchema,
  planSchema,
  planManagementSchema,
  providerAuthorizeQuerySchema,
  providerCalendarListSchema,
  providerCalendarSchema,
  providerConnectResultSchema,
  remoteIcsCreateSchema,
  remoteIcsListSchema,
  reauthenticationAccountListSchema,
  reauthenticationAccountSchema,
  reauthenticationRecoverySchema,
  remoteIcsFailureSchema,
  rsvpResultSchema,
  rsvpStatusSchema,
  safeSessionResponseSchema,
  safeSessionSchema,
  socketPayloadSchema,
  socketTokenSchema,
  socketUrlSchema,
  sourceIdsResponseSchema,
  subscriptionStateSchema,
  successSchema,
  syncAggregateSchema,
  syncDestinationStatusSchema,
  syncSocketMessageSchema,
  syncStatusResponseSchema,
  syncTriggerResultSchema,
  throttleSchema,
  v1IcalSchema,
  workingHoursSchema,
};

export type {
  Account,
  ApiErrorBody,
  ApiToken,
  ApiTokenCreate,
  ApiTokenCreated,
  AuthCapabilities,
  CaldavConnectRequest,
  CaldavDiscoveryRequest,
  CaldavDiscoveryResult,
  CaldavSource,
  CaldavSourceCreate,
  CalendarDetail,
  CalendarIdsRequest,
  CalendarPatch,
  CalendarPauseRequest,
  CalendarPauseResult,
  CalendarRecord,
  CalendarSource,
  CompactCalendar,
  ContractSchema,
  CustomerState,
  Destination,
  DeviceInstallation,
  DeviceRegistration,
  EntitlementLimit,
  Entitlements,
  Event,
  EventCreate,
  EventPatch,
  EventSummary,
  FeedbackRequest,
  FreeSlot,
  FreeTimeQuery,
  FreeTimeResult,
  IcalSettings,
  IcalSettingsPatch,
  InviteRsvpRequest,
  Mapping,
  MobilePlatform,
  NotificationPreferences,
  NotificationPreferencesPatch,
  OAuthSource,
  OAuthSourceCreate,
  OAuthTicketResult,
  Pagination,
  PendingInvite,
  ProviderAuthorizeQuery,
  ProviderCalendar,
  ProviderConnectResult,
  RemoteIcsCreate,
  ReauthenticationAccount,
  RsvpStatus,
  SafeSession,
  SafeSessionResponse,
  SocketPayload,
  SocketUrl,
  SubscriptionState,
  SyncDestinationStatus,
  SyncTriggerResult,
  Throttle,
  WorkingHours,
};
