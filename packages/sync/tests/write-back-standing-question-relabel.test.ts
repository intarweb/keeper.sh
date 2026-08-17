import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { createDeleteConfirmationRecorder } from "../src/sync-user";

const client = new PGlite();
const database = drizzle(client) as unknown as BunSQLDatabase;

const SOURCE_CALENDAR_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_CALENDAR_ID = "22222222-2222-4222-8222-222222222222";

const DDL = `
create table source_destination_mappings (
  "id" uuid primary key default gen_random_uuid(),
  "destinationCalendarId" uuid not null,
  "sourceCalendarId" uuid not null,
  "writeBackMode" text not null default 'off',
  "writeBackState" text not null default 'ok',
  "writeBackStateReason" text,
  "copiesMissingObservedAt" timestamptz
);
`;

const requestDeleteConfirmation = createDeleteConfirmationRecorder(
  database,
  DESTINATION_CALENDAR_ID,
);

interface PairRow {
  copiesMissingObservedAt: Date | null;
  writeBackState: string;
  writeBackStateReason: string | null;
}

const readPair = async (): Promise<PairRow> => {
  const result = await client.query<PairRow>(
    `select "writeBackState", "writeBackStateReason", "copiesMissingObservedAt"
     from source_destination_mappings where "sourceCalendarId" = $1`,
    [SOURCE_CALENDAR_ID],
  );
  const [row] = result.rows;
  if (!row) {
    throw new Error("The pair under test is missing");
  }
  return row;
};

const standOn = async (reason: string): Promise<void> => {
  await client.query(
    `update source_destination_mappings
     set "writeBackState" = 'delete_confirmation_required', "writeBackStateReason" = $2
     where "sourceCalendarId" = $1`,
    [SOURCE_CALENDAR_ID, reason],
  );
};

beforeEach(async () => {
  await client.exec(`drop table if exists source_destination_mappings cascade;`);
  await client.exec(DDL);
  await client.query(
    `insert into source_destination_mappings
       ("destinationCalendarId", "sourceCalendarId", "writeBackMode")
     values ($1, $2, 'edits_and_deletes')`,
    [DESTINATION_CALENDAR_ID, SOURCE_CALENDAR_ID],
  );
});

/*
 * The reason a pair is paused decides which answers the dashboard offers on it, and one of
 * them deletes real events on the source. A pair stopped because the per-event probe keeps
 * finding the copies present is offered only "put the copies back"; re-labelling it from a
 * later reading turns it into the question the API accepts a deletion approval for, about
 * copies that were never missing.
 */
describe("a delete question recorded against a pair that is already asking one", () => {
  it("does not re-label a probe-blocked pause as copies that went missing", async () => {
    await standOn("delete_probe_blocked");

    await requestDeleteConfirmation({
      reason: "all_copies_missing",
      sourceCalendarIds: [SOURCE_CALENDAR_ID],
    });

    const pair = await readPair();
    expect(pair.writeBackStateReason).toBe("delete_probe_blocked");
    expect(pair.copiesMissingObservedAt).toBeNull();
  });

  it("does not re-label a bulk-delete question as copies that went missing", async () => {
    await standOn("delete_breaker_tripped");

    await requestDeleteConfirmation({
      reason: "all_copies_missing",
      sourceCalendarIds: [SOURCE_CALENDAR_ID],
    });

    const pair = await readPair();
    expect(pair.writeBackStateReason).toBe("delete_breaker_tripped");
    expect(pair.copiesMissingObservedAt).toBeNull();
  });

  /*
   * The same question asked again is the same question: the observation it carries has to
   * keep moving, because an approval only counts when it postdates the disappearance it is
   * read against.
   */
  it("re-observes the disappearance when the standing question is the same one", async () => {
    await standOn("all_copies_missing");

    await requestDeleteConfirmation({
      reason: "all_copies_missing",
      sourceCalendarIds: [SOURCE_CALENDAR_ID],
    });

    const pair = await readPair();
    expect(pair.writeBackStateReason).toBe("all_copies_missing");
    expect(pair.copiesMissingObservedAt).toBeInstanceOf(Date);
  });

  it("still records the question on a pair that has none standing", async () => {
    await requestDeleteConfirmation({
      reason: "all_copies_missing",
      sourceCalendarIds: [SOURCE_CALENDAR_ID],
    });

    const pair = await readPair();
    expect(pair.writeBackState).toBe("delete_confirmation_required");
    expect(pair.writeBackStateReason).toBe("all_copies_missing");
    expect(pair.copiesMissingObservedAt).toBeInstanceOf(Date);
  });
});
