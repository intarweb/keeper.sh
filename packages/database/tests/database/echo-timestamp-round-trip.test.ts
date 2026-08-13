import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const administrativeUrl = process.env.KEEPER_TEST_DATABASE_URL;
const migrationScript = `${import.meta.dirname}/../../scripts/migrate.ts`;
const scratchName = `keeper_echo_ts_${process.pid}`;

const scratchUrl = (): string => {
  const url = new URL(administrativeUrl ?? "postgres://localhost");
  url.pathname = `/${scratchName}`;
  return url.toString();
};

const withAdministrativeClient = async <Result>(
  run: (client: Client) => Promise<Result>,
): Promise<Result> => {
  const client = new Client({ connectionString: administrativeUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const runMigrations = async (): Promise<void> => {
  const result = await Bun.$`bun ${migrationScript}`
    .env({ ...process.env, DATABASE_URL: scratchUrl() })
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`Migration failed: ${result.stderr.toString()}`);
  }
};

/*
 * The adoption writer stamps remoteEchoAt by slicing the trailing Z off an ISO string
 * and casting to `timestamp`. Staleness is then decided by subtracting the read-back
 * Date from `now`, so any timezone drift in that round trip silently mis-ages echoes.
 */
describe.skipIf(!administrativeUrl)("remoteEchoAt round trip", () => {
  const connection: { client: SQL | null } = { client: null };

  const withClient = (): SQL => {
    if (!connection.client) {
      throw new Error("Scratch database connection was never established");
    }
    return connection.client;
  };

  beforeAll(async () => {
    await withAdministrativeClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
      await client.query(`CREATE DATABASE "${scratchName}"`);
    });
    await runMigrations();
    connection.client = new SQL(scratchUrl());
  }, 180_000);

  afterAll(async () => {
    await connection.client?.end();
    await withAdministrativeClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
    });
  }, 60_000);

  it("matches how drizzle itself writes a timestamp column", async () => {
    const database = drizzle(withClient());
    const observedAt = new Date("2026-03-01T12:34:56.000Z");
    const naive = observedAt.toISOString().slice(0, -1);

    const probe = pgTable("echo_probe_orm", {
      at: timestamp(),
      id: text().primaryKey(),
    });

    await database.execute(sql`
      create table if not exists "echo_probe_orm" ("id" text primary key, "at" timestamp)
    `);
    await database.insert(probe).values({ at: observedAt, id: "orm" });
    await database.execute(sql`
      insert into "echo_probe_orm" ("id", "at") values ('handrolled', ${naive}::timestamp)
    `);

    const rows = await database.execute(sql`
      select "id", "at" from "echo_probe_orm" order by "id"
    `);
    const byId = new Map(
      (rows as unknown as { at: Date; id: string }[]).map((row) => [row.id, row.at]),
    );

    const handRolled = byId.get("handrolled");
    const ormWritten = byId.get("orm");
    expect(handRolled?.getTime()).toBe(ormWritten?.getTime());
    expect(handRolled).toBeInstanceOf(Date);
  });
});
