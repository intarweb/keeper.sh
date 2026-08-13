import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { sql } from "drizzle-orm";
import type { BunSQLClient } from "../../../src/core/database-client";
import {
  createDatabaseEchoAdoption,
  ECHO_ADOPTION_BATCH_SIZE,
} from "../../../src/core/sync-engine/echo-adoption";
import { EDITABLE_CONTENT_ECHO_ALGORITHM } from "../../../src/core/events/content-hash";
import type { EchoAdoption } from "../../../src/core/sync/operations";

const administrativeUrl = process.env["KEEPER_TEST_DATABASE_URL"];
const scratchName = `keeper_echo_adoption_${process.pid}`;

const scratchUrl = (): string => {
  const url = new URL(administrativeUrl ?? "postgres://localhost");
  url.pathname = `/${scratchName}`;
  return url.toString();
};

const mappingId = (index: number): string =>
  `019c0000-0000-7000-8000-${index.toString().padStart(12, "0")}`;

/*
 * The adoption write is the one statement a fake database cannot validate: a bad cast
 * or a mistyped column silently writes nothing, which reads on the dashboard exactly
 * like convergence.
 */
describe.skipIf(!administrativeUrl)("createDatabaseEchoAdoption against Postgres", () => {
  const connection: { client: SQL | null; database: BunSQLClient | null } = {
    client: null,
    database: null,
  };

  const withDatabase = (): BunSQLClient => {
    if (!connection.database) {
      throw new Error("Scratch database connection was never established");
    }
    return connection.database;
  };

  beforeAll(async () => {
    const administrative = new SQL(administrativeUrl ?? "");
    await administrative.unsafe(`DROP DATABASE IF EXISTS "${scratchName}"`);
    await administrative.unsafe(`CREATE DATABASE "${scratchName}"`);
    await administrative.end();

    connection.client = new SQL(scratchUrl());
    connection.database = drizzle(connection.client) as unknown as BunSQLClient;
    await withDatabase().execute(sql`
      create table "event_mappings" (
        "id" uuid primary key,
        "remoteContentHash" text,
        "remoteEchoAlgorithm" text,
        "remoteEchoAt" timestamp,
        "remoteRejectedContentHash" text
      )
    `);
  }, 120_000);

  afterAll(async () => {
    await connection.client?.end();
    const administrative = new SQL(administrativeUrl ?? "");
    await administrative.unsafe(`DROP DATABASE IF EXISTS "${scratchName}"`);
    await administrative.end();
  }, 60_000);

  it("stores the observation and its recorded instant on the matching rows only", async () => {
    await withDatabase().execute(sql`
      insert into "event_mappings" ("id", "remoteRejectedContentHash")
      values (${mappingId(1)}::uuid, ${"d".repeat(64)}), (${mappingId(2)}::uuid, null)
      on conflict do nothing
    `);
    const recordedAt = new Date("2026-03-08T12:34:56.000Z");

    await createDatabaseEchoAdoption(withDatabase())(
      [{ contentHash: "a".repeat(64), mappingId: mappingId(1) }],
      recordedAt,
    );

    const rows = await withDatabase().execute(sql`
      select "id", "remoteContentHash", "remoteEchoAlgorithm", "remoteEchoAt",
             "remoteRejectedContentHash"
      from "event_mappings" order by "id"
    `) as unknown as {
      id: string;
      remoteContentHash: string | null;
      remoteEchoAlgorithm: string | null;
      remoteEchoAt: Date | null;
      remoteRejectedContentHash: string | null;
    }[];

    expect(rows[0]).toMatchObject({
      remoteContentHash: "a".repeat(64),
      remoteEchoAlgorithm: EDITABLE_CONTENT_ECHO_ALGORITHM,
      remoteRejectedContentHash: null,
    });
    expect(new Date(rows[0]?.remoteEchoAt ?? 0).toISOString())
      .toBe("2026-03-08T12:34:56.000Z");
    expect(rows[1]).toMatchObject({
      remoteContentHash: null,
      remoteEchoAlgorithm: null,
      remoteEchoAt: null,
    });
  });

  it("does not throw when every mapping was replaced concurrently", async () => {
    const adoptions: EchoAdoption[] = [
      { contentHash: "b".repeat(64), mappingId: mappingId(9001) },
    ];

    await expect(
      createDatabaseEchoAdoption(withDatabase())(adoptions, new Date()),
    ).resolves.toBeUndefined();
  });

  it("writes a batch that spans the chunk boundary", async () => {
    const total = ECHO_ADOPTION_BATCH_SIZE + 1;
    const ids = Array.from({ length: total }, (_unused, index) => mappingId(index + 100));
    await withDatabase().execute(sql`
      insert into "event_mappings" ("id")
      values ${sql.join(ids.map((id) => sql`(${id}::uuid)`), sql`, `)}
      on conflict do nothing
    `);

    await createDatabaseEchoAdoption(withDatabase())(
      ids.map((id) => ({ contentHash: "c".repeat(64), mappingId: id })),
      new Date("2026-03-09T00:00:00.000Z"),
    );

    const rows = await withDatabase().execute(sql`
      select count(*)::int as "count" from "event_mappings"
      where "remoteContentHash" = ${"c".repeat(64)}
    `) as unknown as { count: number }[];
    expect(rows[0]?.count).toBe(total);
  }, 60_000);
});
