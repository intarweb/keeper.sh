import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { getWriteBackPoliciesForDestination } from "../../../src/core/events/events";

const client = new PGlite();
const database = drizzle(client);

const SOURCE_CALENDAR_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_CALENDAR_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const CREDENTIAL_ID = "44444444-4444-4444-8444-444444444444";

const DDL = `
create table caldav_credentials (
  "id" uuid primary key,
  "username" text not null
);
create table calendar_accounts (
  "id" uuid primary key,
  "caldavCredentialId" uuid,
  "email" text
);
create table calendars (
  "id" uuid primary key,
  "accountId" uuid,
  "calendarType" text not null default 'google',
  "capabilities" text[] not null default '{pull,push}',
  "disabled" boolean not null default false,
  "ingestLastSucceededAt" timestamp not null default now(),
  "excludeEventDescription" boolean not null default false,
  "excludeEventLocation" boolean not null default false,
  "excludeEventName" boolean not null default false,
  "userId" text not null default 'user-1'
);
create table source_destination_mappings (
  "id" uuid primary key default gen_random_uuid(),
  "deleteConfirmationApprovedAt" timestamp,
  "destinationCalendarId" uuid not null,
  "sourceCalendarId" uuid not null,
  "writeBackMode" text not null default 'off',
  "writeBackState" text not null default 'ok'
);
`;

const seedCalDAVSource = async (username: string): Promise<void> => {
  await client.query(
    `insert into caldav_credentials ("id", "username") values ($1, $2)`,
    [CREDENTIAL_ID, username],
  );
  await client.query(
    `insert into calendar_accounts ("id", "caldavCredentialId") values ($1, $2)`,
    [ACCOUNT_ID, CREDENTIAL_ID],
  );
  await client.query(
    `insert into calendars ("id", "accountId", "calendarType") values ($1, $2, 'caldav')`,
    [SOURCE_CALENDAR_ID, ACCOUNT_ID],
  );
  await client.query(
    `insert into calendars ("id") values ($1)`,
    [DESTINATION_CALENDAR_ID],
  );
  await client.query(
    `insert into source_destination_mappings
       ("destinationCalendarId", "sourceCalendarId", "writeBackMode")
     values ($1, $2, 'edits_and_deletes')`,
    [DESTINATION_CALENDAR_ID, SOURCE_CALENDAR_ID],
  );
};

const readPolicyMode = async (): Promise<string | undefined> => {
  const policies = await getWriteBackPoliciesForDestination(
    database as unknown as BunSQLDatabase,
    DESTINATION_CALENDAR_ID,
  );
  return policies.get(SOURCE_CALENDAR_ID)?.writeBackMode;
};

beforeEach(async () => {
  await client.exec(`drop table if exists source_destination_mappings cascade;`);
  await client.exec(`drop table if exists calendars cascade;`);
  await client.exec(`drop table if exists calendar_accounts cascade;`);
  await client.exec(`drop table if exists caldav_credentials cascade;`);
  await client.exec(DDL);
});

/*
 * The gate taken under the source lock resolves a CalDAV pair against the address its
 * login carries, and the API admits the mode on the same rule. The classifier that decides
 * whether anything is written back at all never reads that address, so an iCloud or
 * Fastmail pair the product accepted classifies as one-way for ever.
 */
describe("write-back policies for a CalDAV source identified by an email login", () => {
  it("carries the mode the user chose", async () => {
    await seedCalDAVSource("me@fastmail.com");

    expect(await readPolicyMode()).toBe("edits_and_deletes");
  });

  it("still refuses a CalDAV source whose login is a bare username", async () => {
    await seedCalDAVSource("nextcloud-admin");

    expect(await readPolicyMode()).toBe("off");
  });
});
