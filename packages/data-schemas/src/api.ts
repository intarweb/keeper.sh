import { type } from "arktype";

const feedbackRequestSchema = type({
  message: "string",
  type: "'feedback' | 'report'",
  "wantsFollowUp?": "boolean",
  "+": "reject",
});
type FeedbackRequest = typeof feedbackRequestSchema.infer;

const createSourceSchema = type({
  name: "string",
  url: "string",
  "+": "reject",
});
type CreateSource = typeof createSourceSchema.infer;

const authSocialProvidersSchema = type({
  google: "boolean",
  microsoft: "boolean",
  "+": "reject",
});
type AuthSocialProviders = typeof authSocialProvidersSchema.infer;

const authCapabilitiesSchema = type({
  commercialMode: "boolean",
  credentialMode: "'email' | 'username'",
  requiresEmailVerification: "boolean",
  socialProviders: authSocialProvidersSchema,
  supportsChangePassword: "boolean",
  supportsPasskeys: "boolean",
  supportsPasswordReset: "boolean",
  "+": "reject",
});
type AuthCapabilities = typeof authCapabilitiesSchema.infer;

const socketMessageSchema = type({
  "data?": "unknown",
  event: "string",
});
type SocketMessage = typeof socketMessageSchema.infer;

const syncOperationSchema = type({
  eventTime: "string",
  type: "'add' | 'remove'",
});
type SyncOperation = typeof syncOperationSchema.infer;

const syncStatusSchema = type({
  destinationId: "string",
  "error?": "string",
  inSync: "boolean",
  "lastOperation?": syncOperationSchema,
  "lastSyncedAt?": "string",
  localEventCount: "number",
  "needsReauthentication?": "boolean",
  "progress?": { current: "number", total: "number" },
  remoteEventCount: "number",
  "stage?": "'fetching' | 'comparing' | 'processing' | 'error'",
  status: "'idle' | 'syncing' | 'error'",
});
type SyncStatus = typeof syncStatusSchema.infer;

const syncAggregateSchema = type({
  "emittedAt?": "string",
  progressPercent: "number",
  seq: "number",
  syncEventsProcessed: "number",
  syncEventsRemaining: "number",
  syncEventsTotal: "number",
  syncing: "boolean",
  "lastSyncedAt?": "string | null",
});
type SyncAggregate = typeof syncAggregateSchema.infer;

const broadcastMessageSchema = type({
  data: "unknown",
  event: "string",
  userId: "string",
});
type BroadcastMessage = typeof broadcastMessageSchema.infer;

const userSchema = type({
  "email?": "string",
  "emailVerified?": "boolean",
  id: "string",
  "name?": "string",
  "username?": "string",
});
type User = typeof userSchema.infer;

const signUpBodySchema = type({
  email: "string",
  "name?": "string",
  "password?": "string",
  "+": "reject",
});
type SignUpBody = typeof signUpBodySchema.infer;

const caldavDiscoverRequestSchema = type({
  password: "string",
  serverUrl: "string",
  username: "string",
  "+": "reject",
});
type CalDAVDiscoverRequest = typeof caldavDiscoverRequestSchema.infer;

const caldavConnectRequestSchema = type({
  calendarUrl: "string",
  password: "string",
  "provider?": "string",
  serverUrl: "string",
  username: "string",
  "+": "reject",
});
type CalDAVConnectRequest = typeof caldavConnectRequestSchema.infer;

const updateSourceDestinationsSchema = type({
  destinationIds: "string[]",
  "+": "reject",
});
type UpdateSourceDestinations = typeof updateSourceDestinationsSchema.infer;

const checkoutSuccessEventSchema = type({
  "currency?": "string",
  "id?": "string",
  "totalAmount?": "number",
});
type CheckoutSuccessEvent = typeof checkoutSuccessEventSchema.infer;

const createOAuthSourceSchema = type({
  "destinationId?": "string",
  externalCalendarId: "string",
  name: "string",
  "oauthSourceCredentialId?": "string",
  "syncFocusTime?": "boolean",
  "syncOutOfOffice?": "boolean",
  "+": "reject",
});
type CreateOAuthSource = typeof createOAuthSourceSchema.infer;

const createCalDAVSourceSchema = type({
  authMethod: "'basic' | 'digest'",
  calendarUrl: "string",
  name: "string",
  password: "string",
  provider: "'caldav' | 'fastmail' | 'icloud'",
  serverUrl: "string",
  username: "string",
  "+": "reject",
});
type CreateCalDAVSource = typeof createCalDAVSourceSchema.infer;

const caldavDiscoverSourceSchema = type({
  password: "string",
  serverUrl: "string",
  username: "string",
  "+": "reject",
});
type CalDAVDiscoverSource = typeof caldavDiscoverSourceSchema.infer;

const oauthCalendarSourceSchema = type({
  createdAt: "string",
  destinationId: "string",
  email: "string | null",
  externalCalendarId: "string",
  id: "string",
  name: "string",
  provider: "string",
});
type OAuthCalendarSource = typeof oauthCalendarSourceSchema.infer;

const updateOAuthSourceDestinationsSchema = type({
  destinationIds: "string[]",
  "+": "reject",
});
type UpdateOAuthSourceDestinations = typeof updateOAuthSourceDestinationsSchema.infer;

export {
  authCapabilitiesSchema,
  authSocialProvidersSchema,
  broadcastMessageSchema,
  caldavConnectRequestSchema,
  caldavDiscoverRequestSchema,
  caldavDiscoverSourceSchema,
  checkoutSuccessEventSchema,
  createCalDAVSourceSchema,
  createOAuthSourceSchema,
  createSourceSchema,
  feedbackRequestSchema,
  oauthCalendarSourceSchema,
  signUpBodySchema,
  socketMessageSchema,
  syncAggregateSchema,
  syncOperationSchema,
  syncStatusSchema,
  updateOAuthSourceDestinationsSchema,
  updateSourceDestinationsSchema,
  userSchema,
};

export type {
  AuthCapabilities,
  AuthSocialProviders,
  BroadcastMessage,
  CalDAVConnectRequest,
  CalDAVDiscoverRequest,
  CalDAVDiscoverSource,
  CheckoutSuccessEvent,
  CreateCalDAVSource,
  CreateOAuthSource,
  CreateSource,
  FeedbackRequest,
  OAuthCalendarSource,
  SignUpBody,
  SocketMessage,
  SyncAggregate,
  SyncOperation,
  SyncStatus,
  UpdateOAuthSourceDestinations,
  UpdateSourceDestinations,
  User,
};
