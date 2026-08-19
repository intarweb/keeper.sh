import { eventStatesTable } from "@keeper.sh/database/schema";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { IcsExceptionDates, IcsRecurrenceRule } from "ts-ics";
import type { SourceEvent } from "../types";
import { serializeStoredIcsRecurrenceRule } from "../events/stored-recurrence";

const EMPTY_ROW_COUNT = 0;

type EventStateInsertRow = typeof eventStatesTable.$inferInsert;

const serializeOptionalJson = (
  value: IcsExceptionDates | IcsRecurrenceRule | undefined,
): string | null => {
  if (!value) {
    return null;
  }
  return JSON.stringify(value);
};

const buildEventStateInsertRow = (
  calendarId: string,
  event: SourceEvent,
): EventStateInsertRow => ({
  availability: event.availability,
  calendarId,
  description: event.description,
  endTime: event.endTime,
  exceptionDates: serializeOptionalJson(event.exceptionDates),
  isAllDay: event.isAllDay,
  location: event.location,
  recurrenceId: event.recurrenceId,
  recurrenceRule: serializeStoredIcsRecurrenceRule(
    event.recurrenceRule,
    event.recurrenceDuration,
  ),
  sourceEventId: event.sourceEventId,
  sourceEventType: event.sourceEventType ?? "default",
  sourceEventUid: event.uid,
  startTime: event.startTime,
  startTimeZone: event.startTimeZone,
  title: event.title,
});

const LEGACY_RECURRING_EVENT_STATE_CONFLICT_TARGET: [
  typeof eventStatesTable.calendarId,
  typeof eventStatesTable.sourceEventUid,
  typeof eventStatesTable.recurrenceId,
] = [
  eventStatesTable.calendarId,
  eventStatesTable.sourceEventUid,
  eventStatesTable.recurrenceId,
];

const LEGACY_NON_RECURRING_EVENT_STATE_CONFLICT_TARGET: [
  typeof eventStatesTable.calendarId,
  typeof eventStatesTable.sourceEventUid,
  typeof eventStatesTable.startTime,
  typeof eventStatesTable.endTime,
] = [
  eventStatesTable.calendarId,
  eventStatesTable.sourceEventUid,
  eventStatesTable.startTime,
  eventStatesTable.endTime,
];

const PROVIDER_EVENT_STATE_CONFLICT_TARGET: [
  typeof eventStatesTable.calendarId,
  typeof eventStatesTable.sourceEventId,
] = [
  eventStatesTable.calendarId,
  eventStatesTable.sourceEventId,
];

const excludedColumn = (columnName: string) => sql.raw(`excluded."${columnName}"`);

const EVENT_STATE_CONFLICT_SET = {
  availability: excludedColumn(eventStatesTable.availability.name),
  description: excludedColumn(eventStatesTable.description.name),
  exceptionDates: excludedColumn(eventStatesTable.exceptionDates.name),
  isAllDay: excludedColumn(eventStatesTable.isAllDay.name),
  location: excludedColumn(eventStatesTable.location.name),
  recurrenceRule: excludedColumn(eventStatesTable.recurrenceRule.name),
  recurrenceId: excludedColumn(eventStatesTable.recurrenceId.name),
  sourceEventId: excludedColumn(eventStatesTable.sourceEventId.name),
  sourceEventType: excludedColumn(eventStatesTable.sourceEventType.name),
  sourceEventUid: excludedColumn(eventStatesTable.sourceEventUid.name),
  startTime: excludedColumn(eventStatesTable.startTime.name),
  startTimeZone: excludedColumn(eventStatesTable.startTimeZone.name),
  endTime: excludedColumn(eventStatesTable.endTime.name),
  title: excludedColumn(eventStatesTable.title.name),
};

const PROVIDER_EVENT_STATE_CONFLICT_SET = EVENT_STATE_CONFLICT_SET;

type EventStateConflictTarget =
  | typeof LEGACY_RECURRING_EVENT_STATE_CONFLICT_TARGET
  | typeof LEGACY_NON_RECURRING_EVENT_STATE_CONFLICT_TARGET
  | typeof PROVIDER_EVENT_STATE_CONFLICT_TARGET;

interface EventStateConflictConfig {
  target: EventStateConflictTarget;
  targetWhere: SQL;
  set: Record<string, SQL>;
}

interface EventStateInsertClient {
  insert: (table: typeof eventStatesTable) => {
    values: {
      (row: EventStateInsertRow): {
        onConflictDoUpdate: (config: EventStateConflictConfig) => Promise<unknown>;
      };
      (rows: EventStateInsertRow[]): {
      onConflictDoUpdate: (config: EventStateConflictConfig) => Promise<unknown>;
      };
    };
  };
}

/*
 * Postgres caps a bind message at 65535 parameters and each row spends roughly
 * fifteen of them, so a snapshot source reporting its whole history in one fetch
 * can exceed the ceiling in a single statement. That rejection rolls the whole
 * ingest back and recurs every tick, so the calendar never stores anything again.
 */
const INSERT_CHUNK_SIZE = 1000;

const insertEventStateRows = async (
  database: EventStateInsertClient,
  rows: EventStateInsertRow[],
  conflictConfig: EventStateConflictConfig,
  onStatement?: () => void,
): Promise<void> => {
  if (rows.length === EMPTY_ROW_COUNT) {
    return;
  }

  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    onStatement?.();
    await database
      .insert(eventStatesTable)
      .values(rows.slice(offset, offset + INSERT_CHUNK_SIZE))
      .onConflictDoUpdate(conflictConfig);
  }
};

interface EventStateRescheduleClient {
  select: (fields: {
    id: typeof eventStatesTable.id;
    sourceEventUid: typeof eventStatesTable.sourceEventUid;
  }) => {
    from: (table: typeof eventStatesTable) => {
      where: (condition: SQL) => Promise<{ id: string; sourceEventUid: string | null }[]>;
    };
  };
  update: (table: typeof eventStatesTable) => {
    set: (values: Record<string, Date | boolean | string | null>) => {
      where: (condition: SQL) => Promise<unknown>;
    };
  };
}

/* Absent values coerce to null so a field cleared upstream cannot survive the rewrite. */
const buildRescheduleUpdateValues = (
  row: EventStateInsertRow,
): Record<string, Date | boolean | string | null> => ({
  availability: row.availability ?? null,
  description: row.description ?? null,
  endTime: row.endTime,
  exceptionDates: row.exceptionDates ?? null,
  isAllDay: row.isAllDay ?? null,
  location: row.location ?? null,
  recurrenceId: row.recurrenceId ?? null,
  recurrenceRule: row.recurrenceRule ?? null,
  sourceEventId: row.sourceEventId ?? null,
  sourceEventType: row.sourceEventType ?? null,
  sourceEventUid: row.sourceEventUid ?? null,
  startTime: row.startTime,
  startTimeZone: row.startTimeZone ?? null,
  title: row.title ?? null,
});

interface ReschedulePartition {
  candidateRowsByCalendar: Map<string, EventStateInsertRow[]>;
  remainingRows: EventStateInsertRow[];
}

const partitionRescheduleCandidates = (rows: EventStateInsertRow[]): ReschedulePartition => {
  const batchUidCounts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.sourceEventUid !== "string") {
      continue;
    }
    batchUidCounts.set(row.sourceEventUid, (batchUidCounts.get(row.sourceEventUid) ?? 0) + 1);
  }

  const isSoleRowForItsUidInBatch = (row: EventStateInsertRow): boolean =>
    typeof row.sourceEventUid === "string" && batchUidCounts.get(row.sourceEventUid) === 1;

  const candidateRowsByCalendar = new Map<string, EventStateInsertRow[]>();
  const remainingRows: EventStateInsertRow[] = [];
  for (const row of rows) {
    if (isSoleRowForItsUidInBatch(row)) {
      const candidates = candidateRowsByCalendar.get(row.calendarId) ?? [];
      candidates.push(row);
      candidateRowsByCalendar.set(row.calendarId, candidates);
    } else {
      remainingRows.push(row);
    }
  }
  return { candidateRowsByCalendar, remainingRows };
};

const readStoredLegacyRowIdsByUid = async (
  client: EventStateRescheduleClient,
  calendarId: string,
  candidateUids: string[],
  onStatement?: () => void,
): Promise<Map<string, string[]>> => {
  const storedRowIdsByUid = new Map<string, string[]>();
  for (let offset = 0; offset < candidateUids.length; offset += INSERT_CHUNK_SIZE) {
    onStatement?.();
    const storedRows = await client.select({
      id: eventStatesTable.id,
      sourceEventUid: eventStatesTable.sourceEventUid,
    })
      .from(eventStatesTable)
      .where(and(
        eq(eventStatesTable.calendarId, calendarId),
        inArray(
          eventStatesTable.sourceEventUid,
          candidateUids.slice(offset, offset + INSERT_CHUNK_SIZE),
        ),
        isNull(eventStatesTable.sourceEventId),
        isNull(eventStatesTable.recurrenceId),
      ) as SQL);
    for (const storedRow of storedRows) {
      if (storedRow.sourceEventUid === null) {
        continue;
      }
      const ids = storedRowIdsByUid.get(storedRow.sourceEventUid) ?? [];
      ids.push(storedRow.id);
      storedRowIdsByUid.set(storedRow.sourceEventUid, ids);
    }
  }
  return storedRowIdsByUid;
};

const resolveSoleStoredRowIdForUid = (
  row: EventStateInsertRow,
  storedRowIdsByUid: Map<string, string[]>,
): string | null => {
  if (typeof row.sourceEventUid !== "string") {
    return null;
  }
  const storedRowIds = storedRowIdsByUid.get(row.sourceEventUid) ?? [];
  const [soleStoredRowId] = storedRowIds;
  if (storedRowIds.length === 1 && soleStoredRowId) {
    return soleStoredRowId;
  }
  return null;
};

const resolveRescheduleClient = (
  database: EventStateInsertClient,
): (EventStateInsertClient & EventStateRescheduleClient) | null => {
  const client = database as EventStateInsertClient & Partial<EventStateRescheduleClient>;
  if (typeof client.select !== "function" || typeof client.update !== "function") {
    return null;
  }
  return client as EventStateInsertClient & EventStateRescheduleClient;
};

/*
 * A rescheduled legacy row changes its storage identity — the non-recurring unique
 * index includes start and end — so ON CONFLICT cannot reach it and the insert would
 * strand a second row for the same event, severing the mapping that referenced it.
 */
const applyLegacyNonRecurringReschedules = async (
  database: EventStateInsertClient,
  rows: EventStateInsertRow[],
  onStatement?: () => void,
): Promise<EventStateInsertRow[]> => {
  const rescheduleClient = resolveRescheduleClient(database);
  if (!rescheduleClient) {
    return rows;
  }

  const { candidateRowsByCalendar, remainingRows } = partitionRescheduleCandidates(rows);
  if (candidateRowsByCalendar.size === EMPTY_ROW_COUNT) {
    return rows;
  }

  for (const [calendarId, candidateRows] of candidateRowsByCalendar) {
    const candidateUids: string[] = [];
    for (const row of candidateRows) {
      if (typeof row.sourceEventUid === "string") {
        candidateUids.push(row.sourceEventUid);
      }
    }
    const storedRowIdsByUid = await readStoredLegacyRowIdsByUid(
      rescheduleClient,
      calendarId,
      candidateUids,
      onStatement,
    );

    for (const row of candidateRows) {
      const updatedRowId = resolveSoleStoredRowIdForUid(row, storedRowIdsByUid);
      if (updatedRowId === null) {
        remainingRows.push(row);
        continue;
      }
      onStatement?.();
      await rescheduleClient.update(eventStatesTable)
        .set(buildRescheduleUpdateValues(row))
        .where(eq(eventStatesTable.id, updatedRowId) as SQL);
    }
  }

  return remainingRows;
};

const insertEventStatesWithConflictResolution = async (
  database: EventStateInsertClient,
  rows: EventStateInsertRow[],
  onStatement?: () => void,
): Promise<void> => {
  const providerRows: EventStateInsertRow[] = [];
  const legacyRecurringRows: EventStateInsertRow[] = [];
  const legacyNonRecurringRows: EventStateInsertRow[] = [];

  for (const row of rows) {
    if (row.sourceEventId) {
      providerRows.push(row);
    } else if (row.recurrenceId) {
      legacyRecurringRows.push(row);
    } else {
      legacyNonRecurringRows.push(row);
    }
  }

  const legacyNonRecurringRowsToInsert = await applyLegacyNonRecurringReschedules(
    database,
    legacyNonRecurringRows,
    onStatement,
  );

  await insertEventStateRows(database, providerRows, {
    set: PROVIDER_EVENT_STATE_CONFLICT_SET,
    target: PROVIDER_EVENT_STATE_CONFLICT_TARGET,
    targetWhere: isNotNull(eventStatesTable.sourceEventId),
  }, onStatement);
  await insertEventStateRows(database, legacyRecurringRows, {
    set: EVENT_STATE_CONFLICT_SET,
    target: LEGACY_RECURRING_EVENT_STATE_CONFLICT_TARGET,
    targetWhere: sql`${eventStatesTable.sourceEventId} is null and ${eventStatesTable.recurrenceId} is not null`,
  }, onStatement);
  await insertEventStateRows(database, legacyNonRecurringRowsToInsert, {
    set: EVENT_STATE_CONFLICT_SET,
    target: LEGACY_NON_RECURRING_EVENT_STATE_CONFLICT_TARGET,
    targetWhere: sql`${eventStatesTable.sourceEventId} is null and ${eventStatesTable.recurrenceId} is null`,
  }, onStatement);
};

export { buildEventStateInsertRow, insertEventStatesWithConflictResolution };
export type { EventStateInsertRow, EventStateInsertClient };
