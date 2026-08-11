import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eventMappingsTable, eventStatesTable } from "./schema";

const EVENT_MAPPING_SOURCE_BACKFILL_BATCH_SIZE = 1000;

interface EventMappingSourceBackfillDatabase {
  backfillMissingSourceCalendarIdsBatch: (batchSize: number) => Promise<number>;
  countMissingSourceCalendarIds: () => Promise<number>;
}

const createEventMappingSourceBackfillDatabase = (
  database: NodePgDatabase,
): EventMappingSourceBackfillDatabase => ({
  backfillMissingSourceCalendarIdsBatch: (batchSize) =>
    database.transaction(async (transaction) => {
      const rows = await transaction
        .select({ id: eventMappingsTable.id })
        .from(eventMappingsTable)
        .innerJoin(eventStatesTable, eq(eventMappingsTable.eventStateId, eventStatesTable.id))
        .where(isNull(eventMappingsTable.sourceCalendarId))
        .orderBy(asc(eventMappingsTable.id))
        .limit(batchSize)
        .for("update", { of: eventMappingsTable });
      if (rows.length === 0) {
        return 0;
      }

      await transaction
        .update(eventMappingsTable)
        .set({
          sourceCalendarId: sql`(
            select ${eventStatesTable.calendarId}
            from ${eventStatesTable}
            where ${eventStatesTable.id} = ${eventMappingsTable.eventStateId}
          )`,
        })
        .where(and(
          inArray(eventMappingsTable.id, rows.map(({ id }) => id)),
          isNull(eventMappingsTable.sourceCalendarId),
        ));
      return rows.length;
    }),
  countMissingSourceCalendarIds: async () => {
    const [result] = await database
      .select({ value: count() })
      .from(eventMappingsTable)
      .where(and(
        isNull(eventMappingsTable.sourceCalendarId),
        isNotNull(eventMappingsTable.eventStateId),
      ));
    return result?.value ?? 0;
  },
});

const backfillEventMappingSourceCalendarIds = async (
  database: EventMappingSourceBackfillDatabase,
): Promise<void> => {
  let updatedCount = 0;
  do {
    updatedCount = await database.backfillMissingSourceCalendarIdsBatch(
      EVENT_MAPPING_SOURCE_BACKFILL_BATCH_SIZE,
    );
  } while (updatedCount > 0);

  const remainingCount = await database.countMissingSourceCalendarIds();
  if (remainingCount !== 0) {
    throw new Error(
      `Event mapping source calendar backfill left ${remainingCount} rows unresolved`,
    );
  }
};

export {
  backfillEventMappingSourceCalendarIds,
  createEventMappingSourceBackfillDatabase,
};
export type { EventMappingSourceBackfillDatabase };
