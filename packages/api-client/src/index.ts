import {
  accountListSchema,
  accountSchema,
  apiTokenCreateSchema,
  apiTokenCreatedSchema,
  apiTokenListSchema,
  authCapabilitiesSchema,
  caldavConnectRequestSchema,
  caldavDiscoveryRequestSchema,
  caldavDiscoveryResultSchema,
  caldavSourceCreateSchema,
  caldavSourceListSchema,
  caldavSourceSchema,
  calendarDetailSchema,
  calendarIdsRequestSchema,
  calendarPatchSchema,
  calendarPauseRequestSchema,
  calendarPauseResultSchema,
  calendarRecordSchema,
  calendarSourceReadListSchema,
  compactCalendarListSchema,
  customerStateSchema,
  destinationListSchema,
  deviceInstallationListSchema,
  deviceRegistrationResultSchema,
  deviceRegistrationSchema,
  destinationIdsResponseSchema,
  entitlementsReadSchema,
  errorResponseSchema,
  eventCountSchema,
  eventCreateSchema,
  eventCreatedMarkerSchema,
  eventReadListSchema,
  eventReadSchema,
  eventPatchSchema,
  feedbackRequestSchema,
  feedbackResultSchema,
  freeTimeQuerySchema,
  freeTimeResultSchema,
  icalSettingsPatchSchema,
  icalSettingsSchema,
  icalTokenSchema,
  inviteRsvpRequestSchema,
  mappingListSchema,
  oauthCallbackStateSchema,
  oauthSourceCreateSchema,
  oauthSourceListSchema,
  oauthSourceSchema,
  oauthTicketRedeemSchema,
  oauthTicketResultSchema,
  pendingInviteListSchema,
  planManagementSchema,
  providerCalendarListSchema,
  remoteIcsCreateSchema,
  remoteIcsListSchema,
  reauthenticationAccountListSchema,
  rsvpResultSchema,
  notificationPreferencesPatchSchema,
  notificationPreferencesSchema,
  safeSessionResponseSchema,
  socketTokenSchema,
  socketUrlSchema,
  sourceIdsResponseSchema,
  successSchema,
  syncStatusResponseSchema,
  syncTriggerResultSchema,
  v1IcalSchema,
  type Account,
  type ApiErrorBody,
  type ApiToken,
  type ApiTokenCreate,
  type ApiTokenCreated,
  type AuthCapabilities,
  type CaldavConnectRequest,
  type CaldavDiscoveryRequest,
  type CaldavDiscoveryResult,
  type CaldavSource,
  type CaldavSourceCreate,
  type CalendarDetail,
  type CalendarIdsRequest,
  type CalendarPatch,
  type CalendarPauseResult,
  type CalendarSource,
  type CalendarRecord,
  type CompactCalendar,
  type ContractSchema,
  type CustomerState,
  type Destination,
  type DeviceInstallation,
  type DeviceRegistration,
  type Entitlements,
  type Event,
  type EventCreate,
  type EventPatch,
  type FeedbackRequest,
  type FreeTimeQuery,
  type FreeTimeResult,
  type IcalSettings,
  type IcalSettingsPatch,
  type InviteRsvpRequest,
  type Mapping,
  type PendingInvite,
  type NotificationPreferences,
  type NotificationPreferencesPatch,
  type OAuthSource,
  type OAuthSourceCreate,
  type OAuthTicketResult,
  type ProviderCalendar,
  type ReauthenticationAccount,
  type RemoteIcsCreate,
  type RsvpStatus,
  type SafeSessionResponse,
  type SocketUrl,
  type SyncDestinationStatus,
  type SyncTriggerResult,
} from "@keeper.sh/api-contracts";

const DEFAULT_BASE_URL = "https://keeper.sh";

// ArkType's morph inference reflects input optionality; assert returns complete Event output.
const compatibleEventSchema = eventReadSchema as unknown as ContractSchema<Event>;
const compatibleEventListSchema = eventReadListSchema as unknown as ContractSchema<Event[]>;
const compatibleCalendarSourceListSchema = calendarSourceReadListSchema as unknown as ContractSchema<CalendarSource[]>;
const compatibleEntitlementsSchema = entitlementsReadSchema as unknown as ContractSchema<Entitlements>;
const compatibleEventCreateResultSchema: ContractSchema<Event | { created: true }> = {
  assert(value) {
    if (eventCreatedMarkerSchema.allows(value)) {
      return value;
    }
    return compatibleEventSchema.assert(value);
  },
  allows(value): value is Event | { created: true } {
    return eventCreatedMarkerSchema.allows(value) || compatibleEventSchema.allows(value);
  },
};
const compatibleEventUpdateResultSchema: ContractSchema<Event | null> = {
  assert(value) {
    if (value === null) {
      return null;
    }
    return compatibleEventSchema.assert(value);
  },
  allows(value): value is Event | null {
    return value === null || compatibleEventSchema.allows(value);
  },
};

type FetchImplementation = (input: Request) => Promise<Response>;
type AuthTransport = (request: Request) => Request | Promise<Request>;

interface KeeperApiClientOptions {
  /** Hosted Keeper or the explicitly selected self-hosted origin. */
  baseUrl?: string;
  /** Injects cookies, bearer headers, device metadata, or another authentication transport. */
  authTransport?: AuthTransport;
  fetch?: FetchImplementation;
  defaultHeaders?: ConstructorParameters<typeof Headers>[0];
  credentials?: "include" | "omit" | "same-origin";
}

interface RequestOptions<Output> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: ConstructorParameters<typeof Headers>[0];
  schema?: ContractSchema<Output>;
  signal?: AbortSignal;
}

interface EventsQuery {
  from?: string;
  to?: string;
  calendarId?: string[];
  availability?: string[];
  isAllDay?: boolean;
}

interface DateRangeQuery {
  from?: string;
  to?: string;
}

interface AccountsQuery {
  provider?: string[];
}

interface InvitesQuery {
  from?: string;
  to?: string;
}

class KeeperApiError extends Error {
  readonly body: ApiErrorBody | null;
  readonly method: string;
  readonly path: string;
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(options: {
    body: ApiErrorBody | null;
    method: string;
    path: string;
    retryAfterSeconds: number | null;
    status: number;
  }) {
    const fallback = `Keeper API request failed with status ${options.status}`;
    super(options.body?.error ?? fallback);
    this.name = "KeeperApiError";
    this.body = options.body;
    this.method = options.method;
    this.path = options.path;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.status = options.status;
  }
}

class KeeperContractError extends Error {
  override readonly cause: unknown;
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Keeper API returned an invalid response for ${path}`);
    this.name = "KeeperContractError";
    this.path = path;
    this.cause = cause;
  }
}

const normalizeBaseUrl = (value: string): URL => {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TypeError("Keeper API base URL must use http or https");
  }
  parsed.hash = "";
  parsed.search = "";
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname += "/";
  }
  return parsed;
};

const encodePathSegment = (value: string): string => encodeURIComponent(value);

const toWallClock = (minute: number): string => {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const appendQuery = (
  path: string,
  values: Record<string, string | number | boolean | string[] | number[] | undefined>,
): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    // eslint-disable-next-line no-undefined -- optional query keys are deliberately omitted.
    if (value === undefined) {
      continue;
    }
    let serializedValue = String(value);
    if (Array.isArray(value)) {
      serializedValue = value.join(",");
    }
    query.set(key, serializedValue);
  }
  const serialized = query.toString();
  if (serialized) {
    return `${path}?${serialized}`;
  }
  return path;
};

const parseRetryAfter = (response: Response): number | null => {
  const raw = response.headers.get("retry-after");
  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  return null;
};

const parseErrorBody = async (response: Response): Promise<ApiErrorBody | null> => {
  const value: unknown = await response.clone().json().catch(() => null);
  if (errorResponseSchema.allows(value)) {
    return value;
  }
  return null;
};

class KeeperApiClient {
  readonly baseUrl: URL;
  private readonly authTransport: AuthTransport;
  private readonly defaultHeaders: Headers;
  private readonly fetchImplementation: FetchImplementation;
  private readonly credentials: "include" | "omit" | "same-origin";

  constructor(options: KeeperApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.authTransport = options.authTransport ?? ((request) => request);
    this.defaultHeaders = new Headers(options.defaultHeaders);
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? "include";
  }

  url(path: string): URL {
    let relative = path;
    if (path.startsWith("/")) {
      relative = path.slice(1);
    }
    return new URL(relative, this.baseUrl);
  }

  async request<Output>(path: string, options: RequestOptions<Output> = {}): Promise<Output> {
    const method = options.method ?? "GET";
    const headers = new Headers(this.defaultHeaders);
    for (const [name, value] of new Headers(options.headers)) {
      headers.set(name, value);
    }
    let body: string | null = null;
    // eslint-disable-next-line no-undefined -- absence and a JSON null body have different semantics.
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }
    headers.set("accept", "application/json");

    const initial = new Request(this.url(path).toString(), {
      body,
      credentials: this.credentials,
      headers,
      method,
      signal: options.signal,
    });
    const request = await this.authTransport(initial);
    const response = await this.fetchImplementation(request);

    if (!response.ok) {
      throw new KeeperApiError({
        body: await parseErrorBody(response),
        method,
        path,
        retryAfterSeconds: parseRetryAfter(response),
        status: response.status,
      });
    }

    if (response.status === 204) {
      return options.body as Output;
    }
    const value: unknown = await response.json();
    if (!options.schema) {
      return value as Output;
    }
    try {
      return options.schema.assert(value);
    } catch (error) {
      throw new KeeperContractError(path, error);
    }
  }

  getAuthCapabilities(signal?: AbortSignal): Promise<AuthCapabilities> {
    return this.request("/api/auth/capabilities", { schema: authCapabilitiesSchema, signal });
  }

  getSession(signal?: AbortSignal): Promise<SafeSessionResponse> {
    return this.request("/api/auth/get-session", { schema: safeSessionResponseSchema, signal });
  }

  listAccounts(signal?: AbortSignal): Promise<Account[]> {
    return this.request("/api/accounts", {
      schema: accountListSchema,
      signal,
    });
  }

  getAccount(id: string, signal?: AbortSignal): Promise<Account> {
    return this.request(`/api/accounts/${encodePathSegment(id)}`, { schema: accountSchema, signal });
  }

  deleteAccount(id: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request(`/api/accounts/${encodePathSegment(id)}`, {
      method: "DELETE",
      schema: successSchema,
      signal,
    });
  }

  listSources(signal?: AbortSignal): Promise<CalendarSource[]> {
    return this.request("/api/sources", { schema: compatibleCalendarSourceListSchema, signal });
  }

  getCalendar(id: string, signal?: AbortSignal): Promise<CalendarDetail> {
    return this.request(`/api/sources/${encodePathSegment(id)}`, { schema: calendarDetailSchema, signal });
  }

  updateCalendar(id: string, patch: CalendarPatch, signal?: AbortSignal): Promise<CalendarRecord> {
    return this.request(`/api/sources/${encodePathSegment(id)}`, {
      body: calendarPatchSchema.assert(patch),
      method: "PATCH",
      schema: calendarRecordSchema,
      signal,
    });
  }

  listMappings(signal?: AbortSignal): Promise<Mapping[]> {
    return this.request("/api/mappings", { schema: mappingListSchema, signal });
  }

  listDestinations(signal?: AbortSignal): Promise<Destination[]> {
    return this.request("/api/destinations", { schema: destinationListSchema, signal });
  }

  getSourceDestinations(id: string, signal?: AbortSignal): Promise<string[]> {
    return this.request(`/api/sources/${encodePathSegment(id)}/destinations`, {
      schema: destinationIdsResponseSchema,
      signal,
    }).then(({ destinationIds }) => destinationIds);
  }

  setSourceDestinations(id: string, request: CalendarIdsRequest, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request(`/api/sources/${encodePathSegment(id)}/destinations`, {
      body: calendarIdsRequestSchema.assert(request),
      method: "PUT",
      schema: successSchema,
      signal,
    });
  }

  getDestinationSources(id: string, signal?: AbortSignal): Promise<string[]> {
    return this.request(`/api/sources/${encodePathSegment(id)}/sources`, {
      schema: sourceIdsResponseSchema,
      signal,
    }).then(({ sourceIds }) => sourceIds);
  }

  setDestinationSources(id: string, request: CalendarIdsRequest, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request(`/api/sources/${encodePathSegment(id)}/sources`, {
      body: calendarIdsRequestSchema.assert(request),
      method: "PUT",
      schema: successSchema,
      signal,
    });
  }

  getEntitlements(signal?: AbortSignal): Promise<Entitlements> {
    return this.request("/api/entitlements", { schema: compatibleEntitlementsSchema, signal });
  }

  getCustomerState(signal?: AbortSignal): Promise<CustomerState> {
    return this.request("/api/auth/customer/state", { schema: customerStateSchema, signal });
  }

  getEventCount(signal?: AbortSignal): Promise<number> {
    return this.request("/api/events/count", { schema: eventCountSchema, signal }).then(({ count }) => count);
  }

  listEvents(query: DateRangeQuery = {}, signal?: AbortSignal): Promise<Event[]> {
    return this.request(appendQuery("/api/events", { ...query }), { schema: compatibleEventListSchema, signal });
  }

  getSyncStatuses(signal?: AbortSignal): Promise<SyncDestinationStatus[]> {
    return this.request("/api/sync/status", { schema: syncStatusResponseSchema, signal })
      .then(({ destinations }) => destinations);
  }

  getSocketUrl(signal?: AbortSignal): Promise<SocketUrl> {
    return this.request("/api/socket/url", { schema: socketUrlSchema, signal });
  }

  getSocketToken(signal?: AbortSignal): Promise<string> {
    return this.request("/api/socket/token", { schema: socketTokenSchema, signal }).then(({ token }) => token);
  }

  getIcalSettings(signal?: AbortSignal): Promise<IcalSettings> {
    return this.request("/api/ical/settings", { schema: icalSettingsSchema, signal });
  }

  updateIcalSettings(patch: IcalSettingsPatch, signal?: AbortSignal): Promise<IcalSettings> {
    return this.request("/api/ical/settings", {
      body: icalSettingsPatchSchema.assert(patch),
      method: "PATCH",
      schema: icalSettingsSchema,
      signal,
    });
  }

  getIcalToken(signal?: AbortSignal): Promise<{ icalUrl: string | null; token: string }> {
    return this.request("/api/ical/token", { schema: icalTokenSchema, signal });
  }

  listApiTokens(signal?: AbortSignal): Promise<ApiToken[]> {
    return this.request("/api/tokens", { schema: apiTokenListSchema, signal });
  }

  createApiToken(input: ApiTokenCreate, signal?: AbortSignal): Promise<ApiTokenCreated> {
    return this.request("/api/tokens", {
      body: apiTokenCreateSchema.assert(input),
      method: "POST",
      schema: apiTokenCreatedSchema,
      signal,
    });
  }

  deleteApiToken(id: string, signal?: AbortSignal): Promise<void> {
    return this.request(`/api/tokens/${encodePathSegment(id)}`, { method: "DELETE", signal });
  }

  submitFeedback(input: FeedbackRequest, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request("/api/feedback", {
      body: feedbackRequestSchema.assert(input),
      method: "POST",
      schema: feedbackResultSchema,
      signal,
    });
  }

  discoverCaldav(input: CaldavDiscoveryRequest, purpose: "source" | "destination", signal?: AbortSignal): Promise<CaldavDiscoveryResult> {
    return this.request(`/api/${purpose}s/caldav/discover`, {
      body: caldavDiscoveryRequestSchema.assert(input),
      method: "POST",
      schema: caldavDiscoveryResultSchema,
      signal,
    });
  }

  connectCaldavDestination(input: CaldavConnectRequest, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request("/api/destinations/caldav", {
      body: caldavConnectRequestSchema.assert(input),
      method: "POST",
      schema: successSchema,
      signal,
    });
  }

  listRemoteIcs(signal?: AbortSignal): Promise<CalendarRecord[]> {
    return this.request("/api/ics", { schema: remoteIcsListSchema, signal });
  }

  createRemoteIcs(input: RemoteIcsCreate, signal?: AbortSignal): Promise<CalendarRecord> {
    return this.request("/api/ics", {
      body: remoteIcsCreateSchema.assert(input),
      method: "POST",
      schema: calendarRecordSchema,
      signal,
    });
  }

  listCaldavSources(provider?: string, signal?: AbortSignal): Promise<CaldavSource[]> {
    return this.request(appendQuery("/api/sources/caldav", { provider }), {
      schema: caldavSourceListSchema,
      signal,
    });
  }

  createCaldavSource(input: CaldavSourceCreate, signal?: AbortSignal): Promise<CaldavSource> {
    return this.request("/api/sources/caldav", {
      body: caldavSourceCreateSchema.assert(input),
      method: "POST",
      schema: caldavSourceSchema,
      signal,
    });
  }

  listOAuthSources(provider: "google" | "outlook", signal?: AbortSignal): Promise<OAuthSource[]> {
    return this.request(`/api/sources/${provider}`, { schema: oauthSourceListSchema, signal });
  }

  createOAuthSource(provider: "google" | "outlook", input: OAuthSourceCreate, signal?: AbortSignal): Promise<OAuthSource> {
    return this.request(`/api/sources/${provider}`, {
      body: oauthSourceCreateSchema.assert(input),
      method: "POST",
      schema: oauthSourceSchema,
      signal,
    });
  }

  listProviderCalendars(
    provider: "google" | "outlook",
    linked: { credentialId: string } | { destinationId: string },
    signal?: AbortSignal,
  ): Promise<ProviderCalendar[]> {
    return this.request(appendQuery(`/api/sources/${provider}/calendars`, linked), {
      schema: providerCalendarListSchema,
      signal,
    }).then(({ calendars }) => calendars);
  }

  buildProviderAuthorizeUrl(
    purpose: "source" | "destination",
    provider: string,
    linkedId?: string,
    returnTo?: string,
  ): URL {
    if (returnTo) {
      if (returnTo.length > 2048) {
        throw new RangeError("OAuth return URL must not exceed 2048 characters");
      }
      const callback = new URL(returnTo);
      const nativeCallback = callback.protocol === "keeper:" && callback.hostname === "oauth" && callback.pathname === "/callback";
      const webCallback = callback.protocol === "https:" && callback.origin === this.baseUrl.origin && callback.pathname === "/open/oauth/callback";
      if (!nativeCallback && !webCallback) {
        throw new TypeError("OAuth return URL must use Keeper's exact callback path");
      }
    }
    let key = "destinationId";
    if (purpose === "source") {
      key = "credentialId";
    }
    const query: Record<string, string> = { provider };
    if (linkedId) {
      query[key] = linkedId;
    }
    if (returnTo) {
      query.returnTo = returnTo;
    }
    const path = appendQuery(`/api/${purpose}s/authorize`, query);
    return this.url(path);
  }

  consumeProviderCallbackState(token: string, signal?: AbortSignal): Promise<{ credentialId: string; provider: string }> {
    return this.request(appendQuery("/api/sources/callback-state", { token }), {
      schema: oauthCallbackStateSchema,
      signal,
    });
  }

  listMobileDevices(signal?: AbortSignal): Promise<DeviceInstallation[]> {
    return this.request("/api/mobile/devices", { schema: deviceInstallationListSchema, signal });
  }

  registerMobileDevice(input: DeviceRegistration, signal?: AbortSignal): Promise<{ installationId: string }> {
    return this.request("/api/mobile/devices", {
      body: deviceRegistrationSchema.assert(input),
      method: "POST",
      schema: deviceRegistrationResultSchema,
      signal,
    });
  }

  revokeMobileDevice(installationId: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request(`/api/mobile/devices/${encodePathSegment(installationId)}`, {
      method: "DELETE",
      schema: successSchema,
      signal,
    });
  }

  getNotificationPreferences(signal?: AbortSignal): Promise<NotificationPreferences> {
    return this.request("/api/mobile/notifications/preferences", {
      schema: notificationPreferencesSchema,
      signal,
    });
  }

  updateNotificationPreferences(
    patch: NotificationPreferencesPatch,
    signal?: AbortSignal,
  ): Promise<NotificationPreferences> {
    return this.request("/api/mobile/notifications/preferences", {
      body: notificationPreferencesPatchSchema.assert(patch),
      method: "PATCH",
      schema: notificationPreferencesSchema,
      signal,
    });
  }

  listReauthenticationAccounts(signal?: AbortSignal): Promise<ReauthenticationAccount[]> {
    return this.request("/api/mobile/reauthentication", {
      schema: reauthenticationAccountListSchema,
      signal,
    });
  }

  redeemMobileOAuthTicket(ticket: string, signal?: AbortSignal): Promise<OAuthTicketResult> {
    return this.request("/api/mobile/oauth/tickets/redeem", {
      body: oauthTicketRedeemSchema.assert({ ticket }),
      method: "POST",
      schema: oauthTicketResultSchema,
      signal,
    });
  }

  getMobilePlanManagementUrl(signal?: AbortSignal): Promise<string | null> {
    return this.request("/api/mobile/plan-management", { schema: planManagementSchema, signal })
      .then(({ url }) => url);
  }

  listV1Accounts(query: AccountsQuery = {}, signal?: AbortSignal): Promise<Account[]> {
    return this.request(appendQuery("/api/v1/accounts", { provider: query.provider }), {
      schema: accountListSchema,
      signal,
    });
  }

  listV1Calendars(query: AccountsQuery = {}, signal?: AbortSignal): Promise<CompactCalendar[]> {
    return this.request(appendQuery("/api/v1/calendars", { provider: query.provider }), {
      schema: compactCalendarListSchema,
      signal,
    });
  }

  setV1CalendarPaused(id: string, paused: boolean, signal?: AbortSignal): Promise<CalendarPauseResult> {
    return this.request(`/api/v1/calendars/${encodePathSegment(id)}`, {
      body: calendarPauseRequestSchema.assert({ paused }),
      method: "PATCH",
      schema: calendarPauseResultSchema,
      signal,
    });
  }

  listV1Invites(calendarId: string, query: InvitesQuery = {}, signal?: AbortSignal): Promise<PendingInvite[]> {
    return this.request(
      appendQuery(`/api/v1/calendars/${encodePathSegment(calendarId)}/invites`, { ...query }),
      { schema: pendingInviteListSchema, signal },
    );
  }

  listV1Events(query: EventsQuery = {}, signal?: AbortSignal): Promise<Event[]> {
    return this.request(appendQuery("/api/v1/events", { ...query }), { schema: compatibleEventListSchema, signal });
  }

  countV1Events(query: EventsQuery = {}, signal?: AbortSignal): Promise<number> {
    return this.request(appendQuery("/api/v1/events", { ...query, count: true }), {
      schema: eventCountSchema,
      signal,
    }).then(({ count }) => count);
  }

  getV1Event(id: string, signal?: AbortSignal): Promise<Event> {
    return this.request(`/api/v1/events/${encodePathSegment(id)}`, { schema: compatibleEventSchema, signal });
  }

  createV1Event(input: EventCreate, signal?: AbortSignal): Promise<Event | { created: true }> {
    return this.request("/api/v1/events", {
      body: eventCreateSchema.assert(input),
      method: "POST",
      schema: compatibleEventCreateResultSchema,
      signal,
    });
  }

  updateV1Event(id: string, patch: EventPatch, signal?: AbortSignal): Promise<Event | null> {
    return this.request(`/api/v1/events/${encodePathSegment(id)}`, {
      body: eventPatchSchema.assert(patch),
      method: "PATCH",
      schema: compatibleEventUpdateResultSchema,
      signal,
    });
  }

  rsvpV1Event(id: string, rsvpStatus: RsvpStatus, signal?: AbortSignal): Promise<{ rsvpStatus: RsvpStatus }> {
    return this.request(`/api/v1/events/${encodePathSegment(id)}`, {
      body: eventPatchSchema.assert({ rsvpStatus }),
      method: "PATCH",
      schema: rsvpResultSchema,
      signal,
    });
  }

  rsvpV1Invite(
    calendarId: string,
    sourceEventUid: string,
    input: InviteRsvpRequest,
    signal?: AbortSignal,
  ): Promise<{ rsvpStatus: RsvpStatus }> {
    return this.request(
      `/api/v1/calendars/${encodePathSegment(calendarId)}/invites/${encodePathSegment(sourceEventUid)}`,
      {
        body: inviteRsvpRequestSchema.assert(input),
        method: "PATCH",
        schema: rsvpResultSchema,
        signal,
      },
    );
  }

  deleteV1Event(id: string, signal?: AbortSignal): Promise<void> {
    return this.request(`/api/v1/events/${encodePathSegment(id)}`, { method: "DELETE", signal });
  }

  findV1FreeTime(query: FreeTimeQuery, signal?: AbortSignal): Promise<FreeTimeResult> {
    const input = freeTimeQuerySchema.assert(query);
    const values: Record<string, string | number | boolean | string[] | number[]> = {
      durationMinutes: input.durationMinutes,
      from: input.from,
      timezone: input.timezone,
      to: input.to,
    };
    if (input.calendarId) {
      values.calendarId = input.calendarId;
    }
    if (typeof input.ignoreAllDayEvents === "boolean") {
      values.ignoreAllDayEvents = input.ignoreAllDayEvents;
    }
    if (typeof input.limit === "number") {
      values.limit = input.limit;
    }
    if (input.workingHours) {
      if (input.workingHours.days) {
        values.workingDays = input.workingHours.days;
      }
      values.workingHoursEnd = toWallClock(input.workingHours.endMinute);
      values.workingHoursStart = toWallClock(input.workingHours.startMinute);
    }
    return this.request(appendQuery("/api/v1/events/free-time", values), { schema: freeTimeResultSchema, signal });
  }

  getV1IcalUrl(signal?: AbortSignal): Promise<string> {
    return this.request("/api/v1/ical", { schema: v1IcalSchema, signal }).then(({ url }) => url);
  }

  triggerV1Sync(signal?: AbortSignal): Promise<SyncTriggerResult> {
    return this.request("/api/v1/sync", {
      method: "POST",
      schema: syncTriggerResultSchema,
      signal,
    });
  }
}

const createKeeperApiClient = (options: KeeperApiClientOptions = {}): KeeperApiClient =>
  new KeeperApiClient(options);

export {
  DEFAULT_BASE_URL,
  KeeperApiClient,
  KeeperApiError,
  KeeperContractError,
  appendQuery,
  createKeeperApiClient,
  normalizeBaseUrl,
};
export type {
  AccountsQuery,
  AuthTransport,
  DateRangeQuery,
  EventsQuery,
  FetchImplementation,
  InvitesQuery,
  KeeperApiClientOptions,
  RequestOptions,
};
