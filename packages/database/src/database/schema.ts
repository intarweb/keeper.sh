import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_FEED_NAME,
  DEFAULT_FEED_SETTINGS,
  DEFAULT_FUTURE_SYNC_RANGE,
  DEFAULT_HISTORIC_SYNC_RANGE,
  SYNC_RANGE_DEFINITIONS,
} from "@keeper.sh/data-schemas";
import { user } from "./auth-schema";

const DEFAULT_EVENT_COUNT = 0;
const WRITE_BACK_MODE_OFF = "off";
const WRITE_BACK_STATE_OK = "ok";

const SYNC_RANGE_SQL_VALUES = SYNC_RANGE_DEFINITIONS
  .map(({ value }) => `'${value}'`)
  .join(", ");

const oauthCredentialsTable = pgTable(
  "oauth_credentials",
  {
    accessToken: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    email: text(),
    expiresAt: timestamp().notNull(),
    id: uuid().notNull().primaryKey().defaultRandom(),
    needsReauthentication: boolean().notNull().default(false),
    provider: text().notNull(),
    refreshToken: text().notNull(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("oauth_credentials_user_idx").on(table.userId),
    index("oauth_credentials_provider_idx").on(table.provider),
    index("oauth_credentials_expires_at_idx").on(table.expiresAt),
  ],
);

const caldavCredentialsTable = pgTable("caldav_credentials", {
  authMethod: text().notNull().default("basic"),
  createdAt: timestamp().notNull().defaultNow(),
  encryptedPassword: text().notNull(),
  id: uuid().notNull().primaryKey().defaultRandom(),
  serverUrl: text().notNull(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  username: text().notNull(),
});

const calendarAccountsTable = pgTable(
  "calendar_accounts",
  {
    accountId: text(),
    authType: text().notNull(),
    caldavCredentialId: uuid().references(() => caldavCredentialsTable.id, {
      onDelete: "cascade",
    }),
    calendarsRefreshAttemptedAt: timestamp(),
    calendarsRefreshedAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
    displayName: text(),
    email: text(),
    id: uuid().notNull().primaryKey().defaultRandom(),
    needsReauthentication: boolean().notNull().default(false),
    oauthCredentialId: uuid().references(() => oauthCredentialsTable.id, {
      onDelete: "cascade",
    }),
    provider: text().notNull(),
    reauthenticationSource: text(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("calendar_accounts_user_idx").on(table.userId),
    index("calendar_accounts_provider_idx").on(table.provider),
    index("calendar_accounts_needs_reauth_idx").on(table.needsReauthentication),
    uniqueIndex("calendar_accounts_provider_account_idx").on(
      table.userId,
      table.provider,
      table.accountId,
    ),
  ],
);

const calendarsTable = pgTable(
  "calendars",
  {
    accountId: uuid()
      .notNull()
      .references(() => calendarAccountsTable.id, { onDelete: "cascade" }),
    calendarType: text().notNull(),
    calendarUrl: text(),
    createdAt: timestamp().notNull().defaultNow(),
    excludeAllDayEvents: boolean().notNull().default(false),
    excludeEventDescription: boolean().notNull().default(true),
    excludeEventLocation: boolean().notNull().default(true),
    excludeEventName: boolean().notNull().default(true),
    excludeFocusTime: boolean().notNull().default(false),
    excludeOutOfOffice: boolean().notNull().default(false),
    includeInIcalFeed: boolean().notNull().default(false),
    treatFullDayTimedEventsAsAllDay: boolean().notNull().default(false),
    customEventName: text().notNull().default("{{calendar_name}}"),
    disabled: boolean().notNull().default(false),
    failureCount: integer().notNull().default(0),
    lastFailureAt: timestamp(),
    nextAttemptAt: timestamp(),
    ingestFailureCount: integer().notNull().default(0),
    ingestLastFailureAt: timestamp(),
    ingestNextAttemptAt: timestamp(),
    ingestFutureRange: text().notNull().default(DEFAULT_FUTURE_SYNC_RANGE),
    ingestHistoricRange: text().notNull().default(DEFAULT_HISTORIC_SYNC_RANGE),
    ingestWindowEnd: timestamp(),
    ingestWindowRecordedAt: timestamp(),
    ingestWindowStart: timestamp(),
    externalCalendarId: text(),
    id: uuid().notNull().primaryKey().defaultRandom(),
    capabilities: text().array().notNull().default(["pull"]),
    name: text().notNull(),
    originalName: text(),
    syncToken: text(),
    syncFutureRange: text().notNull().default(DEFAULT_FUTURE_SYNC_RANGE),
    syncHistoricRange: text().notNull().default(DEFAULT_HISTORIC_SYNC_RANGE),
    unavailableSince: timestamp(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    url: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("calendars_user_idx").on(table.userId),
    index("calendars_account_idx").on(table.accountId),
    index("calendars_capabilities_idx").on(table.capabilities),
    index("calendars_type_idx").on(table.calendarType),
    /*
     * Range columns are plain text so a bad write is only caught when a reader
     * asserts it, far from the writer that caused it. Constraining them here
     * keeps a corrupt persisted value distinguishable from a corrupt read.
     */
    check(
      "calendars_sync_ranges_check",
      sql`"syncHistoricRange" IN (${sql.raw(SYNC_RANGE_SQL_VALUES)}) AND "syncFutureRange" IN (${sql.raw(SYNC_RANGE_SQL_VALUES)})`,
    ),
    check(
      "calendars_ingest_coverage_check",
      sql`"ingestHistoricRange" IN (${sql.raw(SYNC_RANGE_SQL_VALUES)}) AND "ingestFutureRange" IN (${sql.raw(SYNC_RANGE_SQL_VALUES)}) AND (("ingestWindowStart" IS NULL AND "ingestWindowEnd" IS NULL AND "ingestWindowRecordedAt" IS NULL) OR ("ingestWindowStart" IS NOT NULL AND "ingestWindowEnd" IS NOT NULL AND "ingestWindowRecordedAt" IS NOT NULL AND "ingestWindowStart" < "ingestWindowEnd"))`,
    ),
  ],
);

const calendarPushChannelsTable = pgTable(
  "calendar_push_channels",
  {
    accountId: uuid()
      .notNull()
      .references(() => calendarAccountsTable.id, { onDelete: "cascade" }),
    calendarId: uuid().references(() => calendarsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
    expiresAt: timestamp(),
    failureCount: integer().notNull().default(0),
    id: uuid().notNull().primaryKey().defaultRandom(),
    lastFailureAt: timestamp(),
    lastNotificationAt: timestamp(),
    nextAttemptAt: timestamp(),
    provider: text().notNull(),
    providerChannelId: text(),
    providerResourceId: text(),
    reauthorizeRequestedAt: timestamp(),
    resourcePath: text(),
    secretHash: text().notNull(),
    state: text().notNull().default("registering"),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verifiedAt: timestamp(),
  },
  (table) => [
    index("calendar_push_channels_account_idx").on(table.accountId),
    index("calendar_push_channels_expiry_idx").on(table.state, table.expiresAt),
    uniqueIndex("calendar_push_channels_provider_channel_idx")
      .on(table.provider, table.providerChannelId)
      .where(isNotNull(table.providerChannelId)),
    uniqueIndex("calendar_push_channels_scope_idx")
      .on(table.provider, table.calendarId)
      .where(sql`${table.calendarId} is not null and ${table.state} in ('registering', 'active', 'degraded')`),
  ],
);

const calendarSnapshotsTable = pgTable("calendar_snapshots", {
  calendarId: uuid()
    .notNull()
    .references(() => calendarsTable.id, { onDelete: "cascade" })
    .unique(),
  contentHash: text(),
  createdAt: timestamp().notNull().defaultNow(),
  ical: text().notNull(),
  id: uuid().notNull().primaryKey().defaultRandom(),
  public: boolean().notNull().default(false),
});

const eventStatesTable = pgTable(
  "event_states",
  {
    availability: text(),
    calendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
    description: text(),
    endTime: timestamp().notNull(),
    id: uuid().notNull().primaryKey().defaultRandom(),
    location: text(),
    recurrenceRule: text(),
    exceptionDates: text(),
    recurrenceId: timestamp(),
    isAllDay: boolean(),
    sourceEventId: text(),
    sourceEventType: text(),
    sourceEventUid: text(),
    startTime: timestamp().notNull(),
    startTimeZone: text(),
    title: text(),
  },
  (table) => [
    index("event_states_start_time_idx").on(table.startTime),
    index("event_states_end_time_idx").on(table.endTime),
    index("event_states_calendar_idx").on(table.calendarId),
    uniqueIndex("event_states_source_event_idx")
      .on(table.calendarId, table.sourceEventId)
      .where(isNotNull(table.sourceEventId)),
    uniqueIndex("event_states_recurring_instance_idx")
      .on(table.calendarId, table.sourceEventUid, table.recurrenceId)
      .where(sql`${table.sourceEventId} is null and ${table.recurrenceId} is not null`),
    uniqueIndex("event_states_non_recurring_instance_idx")
      .on(table.calendarId, table.sourceEventUid, table.startTime, table.endTime)
      .where(sql`${table.sourceEventId} is null and ${table.recurrenceId} is null`),
  ],
);

const userEventsTable = pgTable(
  "user_events",
  {
    id: uuid().notNull().primaryKey().defaultRandom(),
    calendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceEventUid: text(),
    title: text(),
    description: text(),
    location: text(),
    availability: text(),
    isAllDay: boolean(),
    startTime: timestamp().notNull(),
    endTime: timestamp().notNull(),
    startTimeZone: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("user_events_user_idx").on(table.userId),
    index("user_events_calendar_idx").on(table.calendarId),
    index("user_events_start_time_idx").on(table.startTime),
    index("user_events_end_time_idx").on(table.endTime),
  ],
);

const userSubscriptionsTable = pgTable("user_subscriptions", {
  plan: text().notNull().default("free"),
  polarSubscriptionId: text(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  userId: text()
    .notNull()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
});

const syncStatusTable = pgTable(
  "sync_status",
  {
    calendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    id: uuid().notNull().primaryKey().defaultRandom(),
    lastSyncedAt: timestamp(),
    localEventCount: integer().notNull().default(DEFAULT_EVENT_COUNT),
    remoteEventCount: integer().notNull().default(DEFAULT_EVENT_COUNT),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("sync_status_calendar_idx").on(table.calendarId)],
);

const userSyncRequestsTable = pgTable("user_sync_requests", {
  requestId: uuid().notNull().defaultRandom(),
  requestedAt: timestamp().notNull().defaultNow(),
  userId: text()
    .notNull()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
});

const eventMappingsTable = pgTable(
  "event_mappings",
  {
    calendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
    deleteIdentifier: text(),
    /*
     * Nullable for rolling compatibility with writers from before these columns
     * existed. A null destinationContentHash reads as "unverified", so the next
     * observation records what the destination reported instead of acting on it.
     * The witness columns are always written together.
     */
    destinationAvailability: text(),
    destinationContentHash: text(),
    destinationDescription: text(),
    destinationEndTime: timestamp(),
    destinationEventUid: text().notNull(),
    destinationIsAllDay: boolean(),
    destinationLocation: text(),
    destinationStartTime: timestamp(),
    destinationSummary: text(),
    endTime: timestamp().notNull(),
    // Kept as the legacy cascade in Drizzle metadata so 0077 remains additive.
    // The migration runner upgrades the live FK to SET NULL before applying 0077.
    eventStateId: uuid()
      .references(() => eventStatesTable.id, { onDelete: "set null" }),
    id: uuid().notNull().primaryKey().defaultRandom(),
    missingFirstObservedAt: timestamp(),
    missingObservationCount: integer().notNull().default(DEFAULT_EVENT_COUNT),
    syncEventId: text(),
    syncEventHash: text(),
    // Nullable for rolling compatibility with writers from before this column existed.
    // The migration runner backfills it and installs its validated index/checks.
    sourceCalendarId: uuid(),
    startTime: timestamp().notNull(),
    writeBackDailyCount: integer().notNull().default(DEFAULT_EVENT_COUNT),
    writeBackDailyWindowStart: timestamp(),
    writeBackEpoch: integer().notNull().default(DEFAULT_EVENT_COUNT),
    writeBackEpochWindowStart: timestamp(),
  },
  (table) => [
    uniqueIndex("event_mappings_sync_event_cal_idx")
      .on(table.calendarId, table.syncEventId)
      .where(isNotNull(table.syncEventId)),
    index("event_mappings_calendar_idx").on(table.calendarId),
    index("event_mappings_event_state_idx").on(table.eventStateId),
    index("event_mappings_source_calendar_idx").on(table.sourceCalendarId),
    check(
      "event_mappings_identity_check",
      sql`${table.eventStateId} is not null or ${table.syncEventId} is not null`,
    ),
    index("event_mappings_missing_sync_event_idx")
      .on(table.id)
      .where(isNull(table.syncEventId)),
    index("event_mappings_sync_hash_idx").on(table.syncEventHash),
    index("event_mappings_pending_delete_idx")
      .on(table.calendarId, table.missingFirstObservedAt)
      .where(isNotNull(table.missingFirstObservedAt)),
  ],
);

const sourceDestinationMappingsTable = pgTable(
  "source_destination_mappings",
  {
    createdAt: timestamp().notNull().defaultNow(),
    /*
     * The consent that lets deletions past the bulk breaker. Time bounded rather than a
     * flag some later pass has to clear, so a crash between the answer and the deletions
     * cannot leave the breaker disarmed.
     */
    deleteConfirmationApprovedAt: timestamp(),
    destinationCalendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    id: uuid().notNull().primaryKey().defaultRandom(),
    sourceCalendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    writeBackEnabledAt: timestamp(),
    writeBackMode: text().notNull().default(WRITE_BACK_MODE_OFF),
    writeBackState: text().notNull().default(WRITE_BACK_STATE_OK),
    writeBackStateReason: text(),
  },
  (table) => [
    uniqueIndex("source_destination_mapping_idx").on(
      table.sourceCalendarId,
      table.destinationCalendarId,
    ),
    index("source_destination_mappings_source_idx").on(table.sourceCalendarId),
    index("source_destination_mappings_destination_idx").on(table.destinationCalendarId),
    index("source_destination_mappings_write_back_idx")
      .on(table.writeBackMode)
      .where(sql`${table.writeBackMode} <> 'off'`),
  ],
);

const eventWriteBackTombstonesTable = pgTable(
  "event_write_back_tombstones",
  {
    appliedAt: timestamp().notNull().defaultNow(),
    /*
     * Deliberately unreferenced: a tombstone has to outlive the mapping, the
     * event state and the calendar whose deletion it records.
     */
    destinationCalendarId: uuid().notNull(),
    eventMappingId: uuid().notNull(),
    eventStateId: uuid(),
    expiresAt: timestamp().notNull(),
    id: uuid().notNull().primaryKey().defaultRandom(),
    observedAt: timestamp(),
    snapshot: jsonb().notNull(),
    sourceCalendarId: uuid().notNull(),
    sourceEventUid: text().notNull(),
    state: text().notNull(),
    /*
     * The one reference a tombstone does carry. Everything it records is the user's own
     * event text, so it cannot survive the account: deleting the account has to take the
     * snapshots with it, whatever the retention window still says.
     */
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("event_write_back_tombstones_source_idx").on(
      table.sourceCalendarId,
      table.appliedAt,
    ),
    index("event_write_back_tombstones_expiry_idx").on(table.expiresAt),
    index("event_write_back_tombstones_user_idx").on(table.userId),
    uniqueIndex("event_write_back_tombstones_mapping_idx").on(table.eventMappingId),
  ],
);

const feedbackTable = pgTable(
  "feedback",
  {
    createdAt: timestamp().notNull().defaultNow(),
    id: uuid().notNull().primaryKey().defaultRandom(),
    message: text().notNull(),
    type: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wantsFollowUp: boolean().notNull().default(false),
  },
  (table) => [index("feedback_user_idx").on(table.userId)],
);

const apiTokensTable = pgTable(
  "api_tokens",
  {
    id: uuid().notNull().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    tokenPrefix: text().notNull(),
    lastUsedAt: timestamp(),
    expiresAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("api_tokens_user_idx").on(table.userId),
    uniqueIndex("api_tokens_hash_idx").on(table.tokenHash),
  ],
);

const icalFeedSettingsTable = pgTable("ical_feed_settings", {
  userId: text()
    .notNull()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  includeEventName: boolean().notNull().default(DEFAULT_FEED_SETTINGS.includeEventName),
  includeEventDescription: boolean()
    .notNull()
    .default(DEFAULT_FEED_SETTINGS.includeEventDescription),
  includeEventLocation: boolean().notNull().default(DEFAULT_FEED_SETTINGS.includeEventLocation),
  excludeAllDayEvents: boolean().notNull().default(DEFAULT_FEED_SETTINGS.excludeAllDayEvents),
  customEventName: text().notNull().default(DEFAULT_FEED_SETTINGS.customEventName),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const icalFeedsTable = pgTable(
  "ical_feeds",
  {
    id: uuid().notNull().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull().default(DEFAULT_FEED_NAME),
    token: text().notNull(),
    isDefault: boolean().notNull().default(false),
    legacyAlias: boolean().notNull().default(false),
    includeEventName: boolean().notNull().default(DEFAULT_FEED_SETTINGS.includeEventName),
    includeEventDescription: boolean()
      .notNull()
      .default(DEFAULT_FEED_SETTINGS.includeEventDescription),
    includeEventLocation: boolean().notNull().default(DEFAULT_FEED_SETTINGS.includeEventLocation),
    excludeAllDayEvents: boolean().notNull().default(DEFAULT_FEED_SETTINGS.excludeAllDayEvents),
    excludeFocusTime: boolean().notNull().default(DEFAULT_FEED_SETTINGS.excludeFocusTime),
    excludeOutOfOffice: boolean().notNull().default(DEFAULT_FEED_SETTINGS.excludeOutOfOffice),
    customEventName: text().notNull().default(DEFAULT_FEED_SETTINGS.customEventName),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ical_feeds_user_idx").on(table.userId),
    uniqueIndex("ical_feeds_token_idx").on(table.token),
    uniqueIndex("ical_feeds_default_idx")
      .on(table.userId)
      .where(eq(table.isDefault, sql`true`)),
  ],
);

const icalFeedCalendarsTable = pgTable(
  "ical_feed_calendars",
  {
    id: uuid().notNull().primaryKey().defaultRandom(),
    feedId: uuid()
      .notNull()
      .references(() => icalFeedsTable.id, { onDelete: "cascade" }),
    calendarId: uuid()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ical_feed_calendar_idx").on(table.feedId, table.calendarId),
    index("ical_feed_calendars_feed_idx").on(table.feedId),
    index("ical_feed_calendars_calendar_idx").on(table.calendarId),
  ],
);

export {
  apiTokensTable,
  caldavCredentialsTable,
  calendarAccountsTable,
  calendarPushChannelsTable,
  calendarSnapshotsTable,
  calendarsTable,
  eventMappingsTable,
  eventStatesTable,
  eventWriteBackTombstonesTable,
  feedbackTable,
  icalFeedCalendarsTable,
  icalFeedSettingsTable,
  icalFeedsTable,
  oauthCredentialsTable,
  sourceDestinationMappingsTable,
  syncStatusTable,
  userSyncRequestsTable,
  userEventsTable,
  userSubscriptionsTable,
};
