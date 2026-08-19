import { describe, expect, it } from "vitest";
import type { eventStatesTable } from "@keeper.sh/database/schema";
import { ingestSource } from "../../../src/core/sync-engine/ingest";
import type { StoredSourceEventState } from "../../../src/core/source/stored-event-state";
import type { SourceEvent } from "../../../src/core/types";
import type {
  EventStateInsertRow,
} from "../../../src/core/source/write-event-states";
import {
  buildEventStateInsertRow,
  insertEventStatesWithConflictResolution,
} from "../../../src/core/source/write-event-states";

/*
 * Convergence probe: a feed that legitimately carries two one-off VEVENTs
 * sharing a UID (broken exporters do this; RFC 5545 discourages but the
 * parser accepts it, and storage models it with the per-slot unique index
 * `event_states_non_recurring_instance_idx`). Once the upstream stops
 * changing, repeated ingest over the byte-identical feed must be a no-op.
 */

const CALENDAR_ID = "calendar-duplicate-uid";
const SHARED_UID = "duplicated@example.com";

interface StoredRow extends StoredSourceEventState {
  calendarId: string;
}

let nextRowId = 0;

const allocateRowId = (): string => {
  nextRowId += 1;
  return `row-${String(nextRowId)}`;
};

const CONFLICT_UPDATE_COLUMNS = [
  "availability",
  "description",
  "exceptionDates",
  "isAllDay",
  "location",
  "recurrenceRule",
  "recurrenceId",
  "sourceEventId",
  "sourceEventType",
  "sourceEventUid",
  "startTime",
  "startTimeZone",
  "endTime",
  "title",
] as const;

const toStoredRow = (row: EventStateInsertRow): StoredRow => ({
  availability: row.availability ?? null,
  calendarId: row.calendarId,
  description: row.description ?? null,
  endTime: row.endTime,
  exceptionDates: row.exceptionDates ?? null,
  id: allocateRowId(),
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

const matchesConflictTarget = (stored: StoredRow, incoming: EventStateInsertRow): boolean => {
  if (incoming.sourceEventId) {
    return stored.sourceEventId === incoming.sourceEventId;
  }
  if (incoming.recurrenceId) {
    return stored.sourceEventId === null
      && stored.sourceEventUid === (incoming.sourceEventUid ?? null)
      && stored.recurrenceId?.getTime() === incoming.recurrenceId.getTime();
  }
  return stored.sourceEventId === null
    && stored.recurrenceId === null
    && stored.sourceEventUid === (incoming.sourceEventUid ?? null)
    && stored.startTime.getTime() === incoming.startTime.getTime()
    && stored.endTime.getTime() === incoming.endTime.getTime();
};

const applyConflictUpdate = (stored: StoredRow, incoming: EventStateInsertRow): void => {
  for (const column of CONFLICT_UPDATE_COLUMNS) {
    /*
     * Postgres `excluded."column"` semantics: the value the insert attempted,
     * with omitted columns landing as NULL.
     */
    (stored as unknown as Record<string, unknown>)[column] =
      (incoming as Record<string, unknown>)[column] ?? null;
  }
};

const extractStringParameter = (condition: unknown): string => {
  const { queryChunks } = condition as { queryChunks: unknown[] };
  for (const chunk of queryChunks) {
    if (
      chunk !== null
      && typeof chunk === "object"
      && "value" in chunk
      && typeof (chunk as { value: unknown }).value === "string"
    ) {
      return (chunk as { value: string }).value;
    }
  }
  throw new Error("No string parameter found in SQL condition");
};

/*
 * A faithful in-memory stand-in for the real transaction client the flush
 * hands to insertEventStatesWithConflictResolution: upserts honour the three
 * partial unique indexes, the reschedule probe's select sees every stored
 * legacy row of the calendar, and its update rewrites the addressed row in
 * place.
 */
const createFakeDatabase = (store: StoredRow[]) => ({
  insert: (_table: typeof eventStatesTable) => ({
    values: (value: EventStateInsertRow | EventStateInsertRow[]) => ({
      onConflictDoUpdate: (_config: unknown) => {
        let rows = value;
        if (!Array.isArray(rows)) {
          rows = [rows];
        }
        for (const row of rows) {
          const existing = store.find((stored) => matchesConflictTarget(stored, row));
          if (existing) {
            applyConflictUpdate(existing, row);
          } else {
            store.push(toStoredRow(row));
          }
        }
        return Promise.resolve();
      },
    }),
  }),
  select: () => ({
    from: () => ({
      where: (_condition: unknown) => Promise.resolve(
        store
          .filter((stored) =>
            stored.sourceEventId === null
            && stored.recurrenceId === null
            && stored.sourceEventUid !== null)
          .map((stored) => ({ id: stored.id, sourceEventUid: stored.sourceEventUid })),
      ),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: (condition: unknown) => {
        const rowId = extractStringParameter(condition);
        const target = store.find((stored) => stored.id === rowId);
        if (!target) {
          throw new Error(`Reschedule update addressed unknown row ${rowId}`);
        }
        Object.assign(target, values);
        return Promise.resolve();
      },
    }),
  }),
});

interface RoundResult {
  added: number;
  removed: number;
  storedSlots: string[];
}

const runIngestRound = async (
  store: StoredRow[],
  events: SourceEvent[],
): Promise<RoundResult> => {
  const database = createFakeDatabase(store);
  const result = await ingestSource({
    calendarId: CALENDAR_ID,
    fetchEvents: () => Promise.resolve({ events, isDeltaSync: false }),
    flush: async (changes) => {
      const deleted = new Set(changes.deletes);
      for (let index = store.length - 1; index >= 0; index -= 1) {
        const row = store[index];
        if (row && deleted.has(row.id)) {
          store.splice(index, 1);
        }
      }
      await insertEventStatesWithConflictResolution(
        database,
        changes.inserts.map((event) => buildEventStateInsertRow(CALENDAR_ID, event)),
      );
    },
    readExistingEvents: () => Promise.resolve(store.map((row) => ({ ...row }))),
  });
  return {
    added: result.eventsAdded,
    removed: result.eventsRemoved,
    storedSlots: store
      .map((row) => `${row.startTime.toISOString()}/${row.endTime.toISOString()}`)
      .toSorted(),
  };
};

const oneOffEvent = (start: string, end: string, title: string): SourceEvent => ({
  endTime: new Date(end),
  isAllDay: false,
  startTime: new Date(start),
  title,
  uid: SHARED_UID,
});

describe("ingest convergence — duplicate-UID one-off events", () => {
  it("settles to a fixed point after the feed gains a second event reusing an existing UID", async () => {
    const original = oneOffEvent(
      "2026-09-01T09:00:00.000Z",
      "2026-09-01T10:00:00.000Z",
      "Standup",
    );
    const duplicate = oneOffEvent(
      "2026-09-03T14:00:00.000Z",
      "2026-09-03T15:00:00.000Z",
      "Standup (copy)",
    );

    const store: StoredRow[] = [];

    // Baseline: the feed holds one event; ingest it and settle.
    await runIngestRound(store, [original]);
    const settled = await runIngestRound(store, [original]);
    expect(settled.added).toBe(0);
    expect(settled.removed).toBe(0);

    /*
     * Perturbation: the upstream client duplicates the event, reusing its UID
     * at a new slot. The first pass over the changed feed may legitimately
     * insert the new copy once.
     */
    const perturbedFeed = [original, duplicate];
    await runIngestRound(store, perturbedFeed);

    /*
     * From here the upstream never changes again: every further pass reads a
     * byte-identical feed, so every further pass must be a no-op that leaves
     * both slots stored.
     */
    const expectedSlots = [
      "2026-09-01T09:00:00.000Z/2026-09-01T10:00:00.000Z",
      "2026-09-03T14:00:00.000Z/2026-09-03T15:00:00.000Z",
    ];
    for (let round = 0; round < 4; round += 1) {
      const steadyState = await runIngestRound(store, perturbedFeed);
      expect(steadyState.storedSlots).toEqual(expectedSlots);
      expect(steadyState.added).toBe(0);
      expect(steadyState.removed).toBe(0);
    }
  });
});
