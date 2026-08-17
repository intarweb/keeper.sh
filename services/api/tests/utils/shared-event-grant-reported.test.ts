import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = new PGlite();
const database = drizzle(client);

vi.mock("@/context", () => ({ database }));

vi.mock("@/utils/background-task", () => ({
  spawnBackgroundJob: () => null,
}));

vi.mock("@/utils/enqueue-push-sync", () => ({
  enqueueMappingReplacementSync: () => Promise.resolve(),
  enqueuePushSync: () => Promise.resolve(),
}));

vi.mock("@keeper.sh/sync", () => ({
  createMappingMutationLockId: () => "lock-id",
  createSyncLock: () => ({ acquire: () => Promise.resolve({ acquired: false }) }),
}));

const { getWriteBackStatesForSource, resolveSharedEventGrant } = await import(
  "../../src/utils/source-destination-mappings"
);

const USER_ID = "user-1";

const DDL = `
create table calendar_accounts (
  "id" uuid primary key default gen_random_uuid(),
  "email" text
);
create table calendars (
  "id" uuid primary key default gen_random_uuid(),
  "accountId" uuid,
  "calendarType" text not null default 'google',
  "capabilities" text[] not null default '{pull,push}',
  "disabled" boolean not null default false,
  "ingestLastSucceededAt" timestamptz not null default now(),
  "userId" text not null
);
create table source_destination_mappings (
  "id" uuid primary key default gen_random_uuid(),
  "copiesMissingObservedAt" timestamptz,
  "deleteConfirmationApprovedAt" timestamptz,
  "destinationCalendarId" uuid not null,
  "lastHealthyReadAt" timestamptz,
  "sharedEventWritesGrantedAt" timestamptz,
  "sourceCalendarId" uuid not null,
  "writeBackMode" text not null default 'edits',
  "writeBackState" text not null default 'ok',
  "writeBackStateReason" text
);
`;

const insertCalendar = async (): Promise<string> => {
  const calendar = await client.query<{ id: string }>(
    `insert into calendars ("userId") values ($1) returning "id"`,
    [USER_ID],
  );
  const id = calendar.rows[0]?.id;
  if (!id) {
    throw new Error("Failed to seed a calendar");
  }
  return id;
};

const seedPair = async (writeBackState = "ok"): Promise<{
  destinationCalendarId: string;
  sourceCalendarId: string;
}> => {
  const sourceCalendarId = await insertCalendar();
  const destinationCalendarId = await insertCalendar();
  await client.query(
    `insert into source_destination_mappings
       ("sourceCalendarId", "destinationCalendarId", "writeBackState", "writeBackStateReason")
     values ($1, $2, $3, $4)`,
    [sourceCalendarId, destinationCalendarId, writeBackState, "shared_event"],
  );
  return { destinationCalendarId, sourceCalendarId };
};

beforeEach(async () => {
  await client.exec(`drop table if exists source_destination_mappings cascade;`);
  await client.exec(`drop table if exists calendars cascade;`);
  await client.exec(`drop table if exists calendar_accounts cascade;`);
  await client.exec(DDL);
});

/*
 * The dashboard cannot render a permission it is never told about. Without this the control
 * sits unchecked whatever the user answered, and the answer they gave last week reads as one
 * they never gave.
 */
describe("the permission to write to a meeting is reported to the dashboard", () => {
  it("reports it as withheld until it is given", async () => {
    const { destinationCalendarId, sourceCalendarId } = await seedPair();

    const states = await getWriteBackStatesForSource(USER_ID, sourceCalendarId);

    expect(states[destinationCalendarId]?.sharedEventsGranted).toBe(false);
  });

  it("reports it as given once granted, and releases the hold it answers", async () => {
    const { destinationCalendarId, sourceCalendarId } = await seedPair("grant_required");

    await resolveSharedEventGrant(
      USER_ID,
      sourceCalendarId,
      destinationCalendarId,
      "grant",
    );
    const states = await getWriteBackStatesForSource(USER_ID, sourceCalendarId);

    expect(states[destinationCalendarId]?.sharedEventsGranted).toBe(true);
    expect(states[destinationCalendarId]?.state).toBe("ok");
  });

  it("reports it as withheld again once it is taken back", async () => {
    const { destinationCalendarId, sourceCalendarId } = await seedPair();
    await resolveSharedEventGrant(USER_ID, sourceCalendarId, destinationCalendarId, "grant");

    await resolveSharedEventGrant(
      USER_ID,
      sourceCalendarId,
      destinationCalendarId,
      "withdraw",
    );
    const states = await getWriteBackStatesForSource(USER_ID, sourceCalendarId);

    expect(states[destinationCalendarId]?.sharedEventsGranted).toBe(false);
  });
});
