import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { createDatabaseWriteBackStore } from "../src/write-back";
import type { WriteBackApplierConfig } from "../src/write-back";

const client = new PGlite();
const database = drizzle(client);

const MAPPING_ID = "11111111-1111-4111-8111-111111111111";
const OUTAGE_PASSES = 6;
const FIRST = 1;

const DDL = `
create table event_mappings (
  "id" uuid primary key,
  "writeBackAbandonCount" integer not null default 0,
  "writeBackEpoch" integer not null default 0,
  "writeBackEpochWindowStart" timestamptz,
  "writeBackLastAppliedAt" timestamptz
);
`;

const store = createDatabaseWriteBackStore({
  database: database as unknown as BunSQLDatabase,
} as unknown as WriteBackApplierConfig);

const backdateWindow = async (minutes: number): Promise<void> => {
  await client.query(
    `update event_mappings
       set "writeBackEpochWindowStart" = "writeBackEpochWindowStart" - ($1 || ' minutes')::interval
     where "id" = $2`,
    [String(minutes), MAPPING_ID],
  );
};

const readColumns = async (): Promise<{ abandons: number; epoch: number }> => {
  const result = await client.query<{ abandons: number; epoch: number }>(
    `select "writeBackAbandonCount" as abandons, "writeBackEpoch" as epoch
       from event_mappings where "id" = $1`,
    [MAPPING_ID],
  );
  const [row] = result.rows;
  if (!row) {
    throw new Error("The mapping row went missing");
  }
  return row;
};

beforeEach(async () => {
  await client.exec(`drop table if exists event_mappings cascade;`);
  await client.exec(DDL);
  await client.query(`insert into event_mappings ("id") values ($1)`, [MAPPING_ID]);
});

/*
 * A provider rejecting a write is retried for half an hour; a classification nobody could
 * act on is escalated after five. Counted on one column they cannot be told apart, and the
 * first abandon after an outage reads as the fifth — reverting the pair to one-way for a
 * runaway that never reached a calendar at all.
 */
describe("the abandon budget is not spent by writes a provider rejected", () => {
  it("answers the first abandon after an outage with one, not with the epoch", async () => {
    for (let pass = 0; pass < OUTAGE_PASSES; pass += FIRST) {
      await store.recordFailure(MAPPING_ID, "rejected");
    }

    expect(await store.recordFailure(MAPPING_ID, "abandoned")).toBe(FIRST);
  });

  it("still spends the runaway epoch on an abandoned pass", async () => {
    await store.recordFailure(MAPPING_ID, "abandoned");
    await store.recordFailure(MAPPING_ID, "abandoned");

    expect(await readColumns()).toEqual({ abandons: 2, epoch: 2 });
  });

  it("starts the abandon budget over once the window has gone quiet for an hour", async () => {
    await store.recordFailure(MAPPING_ID, "abandoned");
    await backdateWindow(61);

    expect(await store.recordFailure(MAPPING_ID, "abandoned")).toBe(FIRST);
  });

  it("leaves the abandon budget where it stands while only rejections arrive", async () => {
    await store.recordFailure(MAPPING_ID, "abandoned");
    await store.recordFailure(MAPPING_ID, "rejected");

    expect(await readColumns()).toEqual({ abandons: FIRST, epoch: 2 });
  });
});
