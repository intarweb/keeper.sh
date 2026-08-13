import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const administrativeUrl = process.env.KEEPER_TEST_DATABASE_URL;
const migrationScript = `${import.meta.dirname}/../../scripts/migrate.ts`;
const scratchName = `keeper_echo_columns_${process.pid}`;

const ECHO_COLUMNS = [
  "remoteContentHash",
  "remoteEchoAlgorithm",
  "remoteEchoAt",
  "remoteRejectedContentHash",
];

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

const scratchUrl = (): string => {
  const url = new URL(administrativeUrl ?? "postgres://localhost");
  url.pathname = `/${scratchName}`;
  return url.toString();
};

const withScratchClient = async <Result>(
  run: (client: Client) => Promise<Result>,
): Promise<Result> => {
  const client = new Client({ connectionString: scratchUrl() });
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
    throw new Error(
      `Migration failed: ${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
};

describe.skipIf(!administrativeUrl)("event mapping destination echo columns", () => {
  beforeAll(async () => {
    await withAdministrativeClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
      await client.query(`CREATE DATABASE "${scratchName}"`);
    });
    await runMigrations();
  }, 180_000);

  afterAll(async () => {
    await withAdministrativeClient(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
    });
  }, 60_000);

  it("adds the echo columns as nullable and defaultless", async () => {
    const columns = await withScratchClient(async (client) => {
      const result = await client.query<{
        column_default: string | null;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = 'event_mappings' AND column_name = ANY($1)
         ORDER BY column_name`,
        [ECHO_COLUMNS],
      );
      return result.rows;
    });

    expect(columns).toEqual([
      {
        column_default: null,
        column_name: "remoteContentHash",
        data_type: "text",
        is_nullable: "YES",
      },
      {
        column_default: null,
        column_name: "remoteEchoAlgorithm",
        data_type: "text",
        is_nullable: "YES",
      },
      {
        column_default: null,
        column_name: "remoteEchoAt",
        data_type: "timestamp without time zone",
        is_nullable: "YES",
      },
      {
        column_default: null,
        column_name: "remoteRejectedContentHash",
        data_type: "text",
        is_nullable: "YES",
      },
    ]);
  });

  /*
   * This table takes six figures of inserts and deletes a day and the echo columns are
   * only ever read alongside the row in the existing per-calendar scan, so an index on
   * them would be paid for on every write and never used.
   */
  it("indexes none of the echo columns", async () => {
    const indexes = await withScratchClient(async (client) => {
      const result = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'event_mappings'`,
      );
      return result.rows.map((row) => row.indexdef);
    });

    for (const column of ECHO_COLUMNS) {
      expect(indexes.some((definition) => definition.includes(column))).toBe(false);
    }
  });

  /*
   * The migration runner deletes and re-applies the newest journal row on a database
   * that already carries the change, so a non-idempotent newest migration aborts every
   * deploy behind it.
   */
  it("re-applies cleanly after the newest journal row is rewound", async () => {
    await withScratchClient(async (client) => {
      await client.query(`
        DELETE FROM drizzle.__drizzle_migrations
        WHERE id = (SELECT id FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1)
      `);
    });

    await expect(runMigrations()).resolves.toBeUndefined();

    const columnCount = await withScratchClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM information_schema.columns
         WHERE table_name = 'event_mappings' AND column_name = ANY($1)`,
        [ECHO_COLUMNS],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
    expect(columnCount).toBe(ECHO_COLUMNS.length);
  }, 180_000);
});
