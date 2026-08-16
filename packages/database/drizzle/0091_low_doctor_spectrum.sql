-- Every value in these columns was written as UTC by the application while the columns
-- were "timestamp without time zone", so the driver returned each one interpreted in the
-- client's local zone. On a UTC host that is invisible; anywhere else every instant
-- shifted by the offset.
--
-- The USING clause is load-bearing. Without it Postgres reads each naked timestamp in the
-- session's TimeZone, so this migration run on a non-UTC session would shift every value
-- in the database instead of reinterpreting it correctly.
ALTER TABLE "api_tokens" ALTER COLUMN "lastUsedAt" SET DATA TYPE timestamp with time zone USING "lastUsedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "caldav_credentials" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "caldav_credentials" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "caldav_credentials" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "caldav_credentials" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendar_accounts" ALTER COLUMN "calendarsRefreshAttemptedAt" SET DATA TYPE timestamp with time zone USING "calendarsRefreshAttemptedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_accounts" ALTER COLUMN "calendarsRefreshedAt" SET DATA TYPE timestamp with time zone USING "calendarsRefreshedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_accounts" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_accounts" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendar_accounts" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_accounts" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "lastFailureAt" SET DATA TYPE timestamp with time zone USING "lastFailureAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "lastNotificationAt" SET DATA TYPE timestamp with time zone USING "lastNotificationAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "nextAttemptAt" SET DATA TYPE timestamp with time zone USING "nextAttemptAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "reauthorizeRequestedAt" SET DATA TYPE timestamp with time zone USING "reauthorizeRequestedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendar_push_channels" ALTER COLUMN "verifiedAt" SET DATA TYPE timestamp with time zone USING "verifiedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_snapshots" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_snapshots" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "lastFailureAt" SET DATA TYPE timestamp with time zone USING "lastFailureAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "nextAttemptAt" SET DATA TYPE timestamp with time zone USING "nextAttemptAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "ingestLastFailureAt" SET DATA TYPE timestamp with time zone USING "ingestLastFailureAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "ingestNextAttemptAt" SET DATA TYPE timestamp with time zone USING "ingestNextAttemptAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "ingestLastSucceededAt" SET DATA TYPE timestamp with time zone USING "ingestLastSucceededAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "ingestWindowEnd" SET DATA TYPE timestamp with time zone USING "ingestWindowEnd" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "ingestWindowRecordedAt" SET DATA TYPE timestamp with time zone USING "ingestWindowRecordedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "ingestWindowStart" SET DATA TYPE timestamp with time zone USING "ingestWindowStart" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "unavailableSince" SET DATA TYPE timestamp with time zone USING "unavailableSince" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "destinationEndTime" SET DATA TYPE timestamp with time zone USING "destinationEndTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "destinationStartTime" SET DATA TYPE timestamp with time zone USING "destinationStartTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "endTime" SET DATA TYPE timestamp with time zone USING "endTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "missingFirstObservedAt" SET DATA TYPE timestamp with time zone USING "missingFirstObservedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "startTime" SET DATA TYPE timestamp with time zone USING "startTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "writeBackDailyWindowStart" SET DATA TYPE timestamp with time zone USING "writeBackDailyWindowStart" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "writeBackEpochWindowStart" SET DATA TYPE timestamp with time zone USING "writeBackEpochWindowStart" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_mappings" ALTER COLUMN "writeBackLastAppliedAt" SET DATA TYPE timestamp with time zone USING "writeBackLastAppliedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_states" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_states" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_states" ALTER COLUMN "endTime" SET DATA TYPE timestamp with time zone USING "endTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_states" ALTER COLUMN "recurrenceId" SET DATA TYPE timestamp with time zone USING "recurrenceId" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_states" ALTER COLUMN "startTime" SET DATA TYPE timestamp with time zone USING "startTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_write_back_tombstones" ALTER COLUMN "appliedAt" SET DATA TYPE timestamp with time zone USING "appliedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_write_back_tombstones" ALTER COLUMN "appliedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "event_write_back_tombstones" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "event_write_back_tombstones" ALTER COLUMN "observedAt" SET DATA TYPE timestamp with time zone USING "observedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ical_feed_calendars" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "ical_feed_calendars" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ical_feed_settings" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "ical_feed_settings" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ical_feeds" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "ical_feeds" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ical_feeds" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "ical_feeds" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_credentials" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_credentials" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_credentials" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_credentials" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_credentials" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "source_destination_mappings" ALTER COLUMN "copiesMissingObservedAt" SET DATA TYPE timestamp with time zone USING "copiesMissingObservedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "source_destination_mappings" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "source_destination_mappings" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "source_destination_mappings" ALTER COLUMN "deleteConfirmationApprovedAt" SET DATA TYPE timestamp with time zone USING "deleteConfirmationApprovedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "source_destination_mappings" ALTER COLUMN "lastHealthyReadAt" SET DATA TYPE timestamp with time zone USING "lastHealthyReadAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "source_destination_mappings" ALTER COLUMN "writeBackEnabledAt" SET DATA TYPE timestamp with time zone USING "writeBackEnabledAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sync_status" ALTER COLUMN "lastSyncedAt" SET DATA TYPE timestamp with time zone USING "lastSyncedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sync_status" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sync_status" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "startTime" SET DATA TYPE timestamp with time zone USING "startTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "endTime" SET DATA TYPE timestamp with time zone USING "endTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_events" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_sync_requests" ALTER COLUMN "requestedAt" SET DATA TYPE timestamp with time zone USING "requestedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_sync_requests" ALTER COLUMN "requestedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "accessTokenExpiresAt" SET DATA TYPE timestamp with time zone USING "accessTokenExpiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refreshTokenExpiresAt" SET DATA TYPE timestamp with time zone USING "refreshTokenExpiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "revoked" SET DATA TYPE timestamp with time zone USING "revoked" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "authTime" SET DATA TYPE timestamp with time zone USING "authTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "passkey" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updatedAt" SET DEFAULT now();