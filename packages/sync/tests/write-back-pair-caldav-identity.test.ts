import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { createDatabaseWriteBackStore } from "../src/write-back";

const client = new PGlite();
const database = drizzle(client);

const USER_ID = "user-id";
const SOURCE_CALENDAR_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_CALENDAR_ID = "22222222-2222-4222-8222-222222222222";

const DDL = `
create table caldav_credentials (
  "id" uuid primary key default gen_random_uuid(),
  "username" text not null
);
create table calendar_accounts (
  "id" uuid primary key default gen_random_uuid(),
  "caldavCredentialId" uuid,
  "email" text
);
create table calendars (
  "id" uuid primary key,
  "accountId" uuid,
  "calendarType" text not null default 'google',
  "capabilities" text[] not null default '{pull}',
  "disabled" boolean not null default false
);
create table source_destination_mappings (
  "id" uuid primary key default gen_random_uuid(),
  "destinationCalendarId" uuid not null,
  "sourceCalendarId" uuid not null,
  "writeBackMode" text not null default 'off',
  "writeBackState" text not null default 'ok'
);
`;

const store = createDatabaseWriteBackStore({
  database: database as unknown as BunSQLDatabase,
  encryptionKey: "encryption-key",
  oauthConfig: {},
  userId: USER_ID,
});

const seed = async (username: string): Promise<void> => {
  const credential = await client.query<{ id: string }>(
    `insert into caldav_credentials ("username") values ($1) returning "id"`,
    [username],
  );
  const account = await client.query<{ id: string }>(
    `insert into calendar_accounts ("caldavCredentialId") values ($1) returning "id"`,
    [credential.rows[0]?.id],
  );
  await client.query(
    `insert into calendars ("id", "accountId", "calendarType", "capabilities")
     values ($1, $2, 'caldav', $3)`,
    [SOURCE_CALENDAR_ID, account.rows[0]?.id, ["pull", "push"]],
  );
  await client.query(
    `insert into calendars ("id", "capabilities") values ($1, $2)`,
    [DESTINATION_CALENDAR_ID, ["pull", "push"]],
  );
  await client.query(
    `insert into source_destination_mappings
       ("destinationCalendarId", "sourceCalendarId", "writeBackMode")
     values ($1, $2, 'edits_and_deletes')`,
    [DESTINATION_CALENDAR_ID, SOURCE_CALENDAR_ID],
  );
};

const readPair = (): Promise<{ writeBackMode: string } | null> =>
  store.withSourceLock(SOURCE_CALENDAR_ID, (locked) =>
    locked.readPairWriteBack({
      destinationCalendarId: DESTINATION_CALENDAR_ID,
      sourceCalendarId: SOURCE_CALENDAR_ID,
    }));

beforeEach(async () => {
  await client.exec(`drop table if exists source_destination_mappings cascade;`);
  await client.exec(`drop table if exists calendars cascade;`);
  await client.exec(`drop table if exists calendar_accounts cascade;`);
  await client.exec(`drop table if exists caldav_credentials cascade;`);
  await client.exec(DDL);
});

/*
 * The gate taken under the source lock, immediately before a real calendar is written. A
 * CalDAV account carries no stored email, so the login is the only address it is known by.
 * On a server that authenticates by username there is no address at all, and the
 * authorship guard then refuses every event carrying an ORGANIZER — quarantining the pair
 * on the user's own event and rebuilding the edit that triggered it away.
 */
describe("the last write-back gate for a CalDAV source with no address to compare", () => {
  it("reads the pair as off when the login is a bare username", async () => {
    await seed("nextcloud-admin");

    const pair = await readPair();

    expect(pair?.writeBackMode).toBe("off");
  });

  it("still reads the stored mode when the login is an address", async () => {
    await seed("me@fastmail.com");

    const pair = await readPair();

    expect(pair?.writeBackMode).toBe("edits_and_deletes");
  });
});
