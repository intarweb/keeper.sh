import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = new PGlite();
const database = drizzle(client);

const PROVIDER_ACCOUNT_ID = "116651453584579904080";
const CALLER_USER_ID = "user-2";
const OTHER_HOLDER_USER_ID = "user-1";
const ACCOUNT_LIMIT = 1;

vi.mock("@/context", () => ({
  baseUrl: "https://keeper.test",
  database,
  encryptionKey: "encryption-key",
  oauthProviders: {
    getProvider: () => ({
      exchangeCodeForTokens: () =>
        Promise.resolve({
          access_token: "destination-access",
          expires_in: 3600,
          refresh_token: "destination-refresh",
          scope: "calendar.read calendar.write",
        }),
      fetchUserInfo: () =>
        Promise.resolve({ email: "person@example.com", id: PROVIDER_ACCOUNT_ID }),
    }),
    hasRequiredScopes: () => true,
    isOAuthProvider: () => true,
    validateState: () =>
      Promise.resolve({
        destinationId: null,
        sourceCredentialId: null,
        userId: CALLER_USER_ID,
      }),
  },
  premiumService: {
    getAccountLimit: () => ACCOUNT_LIMIT,
    getUserPlan: () => Promise.resolve("free"),
  },
}));

vi.mock("@/utils/logging", () => ({
  widelog: {
    error: () => null,
    errorFields: () => null,
    set: () => null,
  },
}));

vi.mock("@/utils/enqueue-push-sync", () => ({
  enqueuePushSync: () => Promise.resolve(),
}));

const { handleOAuthCallback } = await import("../../src/utils/oauth");

const DDL = `
create table oauth_credentials (
  "id" uuid primary key default gen_random_uuid(),
  "accessToken" text not null,
  "createdAt" timestamp not null default now(),
  "email" text,
  "expiresAt" timestamp not null,
  "needsReauthentication" boolean not null default false,
  "provider" text not null,
  "refreshToken" text not null,
  "updatedAt" timestamp not null default now(),
  "userId" text not null
);
create table caldav_credentials (
  "id" uuid primary key default gen_random_uuid(),
  "authMethod" text not null default 'basic',
  "encryptedPassword" text not null,
  "serverUrl" text not null,
  "username" text not null
);
create table calendar_accounts (
  "id" uuid primary key default gen_random_uuid(),
  "accountId" text,
  "authType" text not null,
  "caldavCredentialId" uuid,
  "calendarsRefreshAttemptedAt" timestamp,
  "calendarsRefreshedAt" timestamp,
  "createdAt" timestamp not null default now(),
  "displayName" text,
  "email" text,
  "needsReauthentication" boolean not null default false,
  "oauthCredentialId" uuid,
  "provider" text not null,
  "reauthenticationSource" text,
  "updatedAt" timestamp not null default now(),
  "userId" text not null
);
create unique index "calendar_accounts_provider_account_idx"
  on "calendar_accounts" ("userId", "provider", "accountId");
create table calendars (
  "id" uuid primary key default gen_random_uuid(),
  "accountId" uuid not null,
  "calendarType" text not null,
  "calendarUrl" text,
  "capabilities" text[] not null default array['pull'],
  "createdAt" timestamp not null default now(),
  "customEventName" text not null default '{{calendar_name}}',
  "disabled" boolean not null default false,
  "excludeAllDayEvents" boolean not null default false,
  "excludeEventDescription" boolean not null default true,
  "excludeEventLocation" boolean not null default true,
  "excludeEventName" boolean not null default true,
  "excludeFocusTime" boolean not null default false,
  "excludeOutOfOffice" boolean not null default false,
  "externalCalendarId" text,
  "failureCount" integer not null default 0,
  "includeInIcalFeed" boolean not null default false,
  "ingestFailureCount" integer not null default 0,
  "ingestFutureRange" text not null default '2_years',
  "ingestHistoricRange" text not null default '1_month',
  "ingestLastFailureAt" timestamp,
  "ingestNextAttemptAt" timestamp,
  "ingestWindowEnd" timestamp,
  "ingestWindowRecordedAt" timestamp,
  "ingestWindowStart" timestamp,
  "lastFailureAt" timestamp,
  "name" text not null,
  "nextAttemptAt" timestamp,
  "originalName" text,
  "syncFutureRange" text not null default '2_years',
  "syncHistoricRange" text not null default '1_month',
  "syncToken" text,
  "treatFullDayTimedEventsAsAllDay" boolean not null default false,
  "unavailableSince" timestamp,
  "updatedAt" timestamp not null default now(),
  "url" text,
  "userId" text not null
);
create table source_destination_mappings (
  "id" uuid primary key default gen_random_uuid(),
  "createdAt" timestamp not null default now(),
  "destinationCalendarId" uuid not null,
  "sourceCalendarId" uuid not null
);
create table sync_status (
  "id" uuid primary key default gen_random_uuid(),
  "calendarId" uuid not null,
  "lastSyncedAt" timestamp,
  "localEventCount" integer not null default 0,
  "remoteEventCount" integer not null default 0,
  "updatedAt" timestamp not null default now()
);
create unique index "sync_status_calendar_idx" on "sync_status" ("calendarId");
`;

const resetDatabase = async (): Promise<void> => {
  await client.exec(`
    drop table if exists sync_status, source_destination_mappings, calendars,
      calendar_accounts, oauth_credentials, caldav_credentials cascade;
  `);
  await client.exec(DDL);
};

const seedAccount = async (userId: string, accountId: string): Promise<void> => {
  await client.query(
    `insert into calendar_accounts ("accountId", "authType", "provider", "userId")
     values ($1, 'oauth', 'google', $2)`,
    [accountId, userId],
  );
};

const runCallback = (): Promise<unknown> =>
  handleOAuthCallback({
    code: "oauth-code",
    error: null,
    provider: "google",
    state: "oauth-state",
  });

describe("the account limit applied when a destination callback completes", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("counts only the caller's accounts when another user holds the provider identity", async () => {
    await seedAccount(OTHER_HOLDER_USER_ID, PROVIDER_ACCOUNT_ID);
    await seedAccount(CALLER_USER_ID, "already-connected-account");

    await expect(runCallback()).rejects.toThrow("Account limit reached");
  });

  it("skips the limit when the caller already holds the provider identity", async () => {
    await seedAccount(OTHER_HOLDER_USER_ID, PROVIDER_ACCOUNT_ID);
    await seedAccount(CALLER_USER_ID, PROVIDER_ACCOUNT_ID);

    await expect(runCallback()).resolves.toEqual(
      expect.objectContaining({ userId: CALLER_USER_ID }),
    );
  });
});
