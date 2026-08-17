import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const MIGRATION_TIMEOUT_MS = 180_000;
const EVENT_STATE_FOREIGN_KEY = "event_mappings_eventStateId_event_states_id_fk";
const SET_NULL_DELETE_ACTION = "n";

const testDatabaseUrl = Bun.env.KEEPER_TEST_DATABASE_URL ?? null;

interface ForeignKeyState {
  conname: string;
  confdeltype: string;
  convalidated: boolean;
}

interface MappingFixture {
  eventStateId: string;
  mappingId: string;
}

interface MappingRow {
  eventStateId: string | null;
  id: string;
  syncEventId: string | null;
}

const requireTestDatabaseUrl = (): string => {
  if (!testDatabaseUrl) {
    throw new Error("KEEPER_TEST_DATABASE_URL is required for the tombstone suite");
  }
  return testDatabaseUrl;
};

const withClient = async <Result>(run: (client: Client) => Promise<Result>): Promise<Result> => {
  const client = new Client({ connectionString: requireTestDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

/**
 * The live SET NULL constraint is installed by the migration runner rather than by a
 * drizzle SQL file, so the suite has to exercise the real entrypoint to observe it.
 */
const runMigrationRunner = async (): Promise<void> => {
  const migrationScript = `${import.meta.dirname}/../../scripts/migrate.ts`;
  const migration = Bun.spawn(["bun", migrationScript], {
    env: { ...Bun.env, DATABASE_URL: requireTestDatabaseUrl() },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    migration.exited,
    new Response(migration.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Migration runner failed with code ${exitCode}: ${stderr}`);
  }
};

const readForeignKeyState = async (client: Client): Promise<ForeignKeyState | null> => {
  const result = await client.query<ForeignKeyState>(
    `SELECT conname, confdeltype::text AS confdeltype, convalidated
     FROM pg_constraint
     WHERE conname = $1
       AND conrelid = to_regclass('public.event_mappings')`,
    [EVENT_STATE_FOREIGN_KEY],
  );
  return result.rows[0] ?? null;
};

const seedMappingFixture = async (client: Client): Promise<MappingFixture> => {
  const userId = `tombstone-${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO "user" (id, name, email) VALUES ($1, 'Tombstone Probe', $2)`,
    [userId, `${userId}@example.test`],
  );
  const account = await client.query<{ id: string }>(
    `INSERT INTO "calendar_accounts" ("authType", "provider", "userId")
     VALUES ('caldav', 'fastmail', $1) RETURNING id`,
    [userId],
  );
  const calendar = await client.query<{ id: string }>(
    `INSERT INTO "calendars" ("accountId", "calendarType", "name", "userId")
     VALUES ($1, 'source', 'Tombstone Probe Calendar', $2) RETURNING id`,
    [account.rows[0]?.id, userId],
  );
  const calendarId = calendar.rows[0]?.id;
  const eventState = await client.query<{ id: string }>(
    `INSERT INTO "event_states" ("calendarId", "startTime", "endTime")
     VALUES ($1, now(), now() + interval '1 hour') RETURNING id`,
    [calendarId],
  );
  const eventStateId = eventState.rows[0]?.id;
  const mapping = await client.query<{ id: string }>(
    `INSERT INTO "event_mappings"
       ("calendarId", "destinationEventUid", "startTime", "endTime", "eventStateId")
     VALUES ($1, 'tombstone-remote-uid', now(), now() + interval '1 hour', $2)
     RETURNING id`,
    [calendarId, eventStateId],
  );
  if (!eventStateId || !mapping.rows[0]) {
    throw new Error("Failed to seed the event mapping tombstone fixture");
  }
  return { eventStateId: eventStateId, mappingId: mapping.rows[0].id };
};

const pruneEventStateAndReadMapping = async (
  client: Client,
  fixture: MappingFixture,
): Promise<MappingRow[]> => {
  await client.query(`DELETE FROM "event_states" WHERE id = $1`, [fixture.eventStateId]);
  const result = await client.query<MappingRow>(
    `SELECT id, "eventStateId", "syncEventId" FROM "event_mappings" WHERE id = $1`,
    [fixture.mappingId],
  );
  return result.rows;
};

const installLegacyCascade = async (client: Client): Promise<void> => {
  await client.query(`
    ALTER TABLE "event_mappings"
      DROP CONSTRAINT "${EVENT_STATE_FOREIGN_KEY}",
      ADD CONSTRAINT "${EVENT_STATE_FOREIGN_KEY}"
        FOREIGN KEY ("eventStateId") REFERENCES "event_states"("id")
        ON DELETE CASCADE
  `);
};

describe.skipIf(!testDatabaseUrl)("event mapping tombstones survive the ingest prune", () => {
  beforeAll(async () => {
    await runMigrationRunner();
  }, MIGRATION_TIMEOUT_MS);

  it("installs the event state foreign key as validated SET NULL", async () => {
    const state = await withClient(readForeignKeyState);

    expect(state).not.toBeNull();
    expect(state?.confdeltype).toBe(SET_NULL_DELETE_ACTION);
    expect(state?.convalidated).toBe(true);
  });

  it("keeps the mapping when the prune deletes its event state", async () => {
    const rows = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const fixture = await seedMappingFixture(client);
        return await pruneEventStateAndReadMapping(client, fixture);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventStateId).toBeNull();
    expect(rows[0]?.syncEventId).toEqual(expect.any(String));
  });

  it("refuses a mapping that would be left without any identity", async () => {
    const insert = withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO "event_mappings"
             ("calendarId", "destinationEventUid", "startTime", "endTime")
           VALUES (gen_random_uuid(), 'identityless-uid', now(), now())`,
        );
      } finally {
        await client.query("ROLLBACK");
      }
    });

    await expect(insert).rejects.toThrow("event_mappings_identity_check");
  });

  it("fails the same assertion under the legacy cascade constraint", async () => {
    const rows = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await installLegacyCascade(client);
        const fixture = await seedMappingFixture(client);
        return await pruneEventStateAndReadMapping(client, fixture);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    expect(rows).toHaveLength(0);
  });
});
