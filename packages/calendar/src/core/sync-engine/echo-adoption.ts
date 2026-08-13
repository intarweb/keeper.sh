import type { BunSQLClient } from "../database-client";
import { EDITABLE_CONTENT_ECHO_ALGORITHM } from "../events/content-hash";
import type { EchoAdoption } from "../sync/operations";
import { sql } from "drizzle-orm";

const ECHO_ADOPTION_BATCH_SIZE = 500;

const chunk = <TItem>(items: TItem[], size: number): TItem[][] => {
  const chunks: TItem[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
};

/*
 * Postgres reads a bare ISO instant into a timestamp column as the same naive UTC
 * value Drizzle writes for every other timestamp on this table.
 */
const toNaiveUtc = (value: Date): string => value.toISOString().slice(0, -1);

type EchoAdoptionWriter = (
  adoptions: EchoAdoption[],
  recordedAt: Date,
) => Promise<void>;

/*
 * Set-based and outside the operation flush: an adoption is coupled to nothing, and
 * losing one costs a single cycle. A batch matching no rows is normal, because a
 * concurrent run replaces a mapping by deleting and re-inserting it.
 */
const createDatabaseEchoAdoption = (database: BunSQLClient): EchoAdoptionWriter =>
  async (adoptions: EchoAdoption[], recordedAt: Date): Promise<void> => {
    if (adoptions.length === 0) {
      return;
    }

    const observedAt = toNaiveUtc(recordedAt);
    for (const batch of chunk(adoptions, ECHO_ADOPTION_BATCH_SIZE)) {
      const rows = batch.map((adoption) =>
        sql`(${adoption.mappingId}::uuid, ${adoption.contentHash}::text)`);
      await database.execute(sql`
        update "event_mappings"
        set "remoteContentHash" = "adoption"."content_hash",
            "remoteEchoAlgorithm" = ${EDITABLE_CONTENT_ECHO_ALGORITHM}::text,
            "remoteEchoAt" = ${observedAt}::timestamp
        from (values ${sql.join(rows, sql`, `)}) as "adoption" ("id", "content_hash")
        where "event_mappings"."id" = "adoption"."id"
      `);
    }
  };

export { createDatabaseEchoAdoption, ECHO_ADOPTION_BATCH_SIZE };
export type { EchoAdoptionWriter };
