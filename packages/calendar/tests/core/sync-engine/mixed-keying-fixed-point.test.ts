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
  rowIds: string[];
}

const runIngestRound = async (
  calendarId: string,
  store: StoredRow[],
  events: SourceEvent[],
): Promise<RoundResult> => {
  const database = createFakeDatabase(store);
  const result = await ingestSource({
    calendarId,
    fetchEvents: () => Promise.resolve({
      events,
      isDeltaSync: false,
      syncWindow: {
        timeMax: new Date("2027-01-01T00:00:00.000Z"),
        timeMin: new Date("2026-08-01T00:00:00.000Z"),
      },
    }),
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
        changes.inserts.map((event) => buildEventStateInsertRow(calendarId, event)),
      );
    },
    readExistingEvents: () => Promise.resolve(store.map((row) => ({ ...row }))),
  });
  return {
    added: result.eventsAdded,
    removed: result.eventsRemoved,
    rowIds: store.map((row) => row.id).toSorted(),
  };
};

describe("round 4 convergence probes", () => {
  it("S1: moved RECURRENCE-ID override converges as one in-place update", async () => {
    const calendarId = "probe-s1";
    const master: SourceEvent = {
      endTime: new Date("2026-09-01T10:00:00.000Z"),
      isAllDay: false,
      recurrenceRule: { frequency: "WEEKLY" },
      startTime: new Date("2026-09-01T09:00:00.000Z"),
      title: "Series",
      uid: "series@s1",
    };
    const override: SourceEvent = {
      endTime: new Date("2026-09-08T12:00:00.000Z"),
      isAllDay: false,
      recurrenceId: new Date("2026-09-08T09:00:00.000Z"),
      startTime: new Date("2026-09-08T11:00:00.000Z"),
      title: "Series (moved)",
      uid: "series@s1",
    };
    const store: StoredRow[] = [];
    await runIngestRound(calendarId, store, [master, override]);
    const settled = await runIngestRound(calendarId, store, [master, override]);
    expect([settled.added, settled.removed]).toEqual([0, 0]);
    const rowIdsBefore = settled.rowIds;

    const movedOverride: SourceEvent = {
      ...override,
      endTime: new Date("2026-09-08T15:00:00.000Z"),
      startTime: new Date("2026-09-08T14:00:00.000Z"),
    };
    const perturbed = await runIngestRound(calendarId, store, [master, movedOverride]);
    expect(perturbed.removed).toBe(0);
    expect(perturbed.rowIds).toEqual(rowIdsBefore);
    const after = await runIngestRound(calendarId, store, [master, movedOverride]);
    expect([after.added, after.removed]).toEqual([0, 0]);
  });

  it("S2: master DTSTART reschedule with an override present keeps both row ids", async () => {
    const calendarId = "probe-s2";
    const master: SourceEvent = {
      endTime: new Date("2026-09-01T10:00:00.000Z"),
      isAllDay: false,
      recurrenceRule: { frequency: "WEEKLY" },
      startTime: new Date("2026-09-01T09:00:00.000Z"),
      title: "Series",
      uid: "series@s2",
    };
    const override: SourceEvent = {
      endTime: new Date("2026-09-08T12:00:00.000Z"),
      isAllDay: false,
      recurrenceId: new Date("2026-09-08T09:00:00.000Z"),
      startTime: new Date("2026-09-08T11:00:00.000Z"),
      title: "Series (moved)",
      uid: "series@s2",
    };
    const store: StoredRow[] = [];
    await runIngestRound(calendarId, store, [master, override]);
    const settled = await runIngestRound(calendarId, store, [master, override]);
    expect([settled.added, settled.removed]).toEqual([0, 0]);
    const rowIdsBefore = settled.rowIds;

    const movedMaster: SourceEvent = {
      ...master,
      endTime: new Date("2026-09-01T11:00:00.000Z"),
      startTime: new Date("2026-09-01T10:00:00.000Z"),
    };
    const perturbed = await runIngestRound(calendarId, store, [movedMaster, override]);
    expect(perturbed.removed).toBe(0);
    expect(perturbed.rowIds).toEqual(rowIdsBefore);
    const after = await runIngestRound(calendarId, store, [movedMaster, override]);
    expect([after.added, after.removed]).toEqual([0, 0]);
  });

  it("S3: all-day one-off reschedule converges as one in-place update", async () => {
    const calendarId = "probe-s3";
    const allDay: SourceEvent = {
      endTime: new Date("2026-09-02T00:00:00.000Z"),
      isAllDay: true,
      startTime: new Date("2026-09-01T00:00:00.000Z"),
      title: "Holiday",
      uid: "allday@s3",
    };
    const store: StoredRow[] = [];
    await runIngestRound(calendarId, store, [allDay]);
    const settled = await runIngestRound(calendarId, store, [allDay]);
    expect([settled.added, settled.removed]).toEqual([0, 0]);
    const rowIdsBefore = settled.rowIds;

    const moved: SourceEvent = {
      ...allDay,
      endTime: new Date("2026-09-03T00:00:00.000Z"),
      startTime: new Date("2026-09-02T00:00:00.000Z"),
    };
    const perturbed = await runIngestRound(calendarId, store, [moved]);
    expect(perturbed.removed).toBe(0);
    expect(perturbed.rowIds).toEqual(rowIdsBefore);
    const after = await runIngestRound(calendarId, store, [moved]);
    expect([after.added, after.removed]).toEqual([0, 0]);
  });

  it("S4: EXDATE added to a master converges as one in-place update", async () => {
    const calendarId = "probe-s4";
    const master: SourceEvent = {
      endTime: new Date("2026-09-01T10:00:00.000Z"),
      isAllDay: false,
      recurrenceRule: { frequency: "WEEKLY" },
      startTime: new Date("2026-09-01T09:00:00.000Z"),
      title: "Series",
      uid: "series@s4",
    };
    const store: StoredRow[] = [];
    await runIngestRound(calendarId, store, [master]);
    const settled = await runIngestRound(calendarId, store, [master]);
    expect([settled.added, settled.removed]).toEqual([0, 0]);
    const rowIdsBefore = settled.rowIds;

    const excepted: SourceEvent = {
      ...master,
      exceptionDates: [{ date: new Date("2026-09-15T09:00:00.000Z") }],
    };
    const perturbed = await runIngestRound(calendarId, store, [excepted]);
    expect(perturbed.removed).toBe(0);
    expect(perturbed.rowIds).toEqual(rowIdsBefore);
    const after = await runIngestRound(calendarId, store, [excepted]);
    expect([after.added, after.removed]).toEqual([0, 0]);
  });

  it("S5: feed carrying provider-keyed and uid-keyed copies of one slot reaches a fixed point", async () => {
    const calendarId = "probe-s5";
    const providerCopy: SourceEvent = {
      endTime: new Date("2026-09-01T10:00:00.000Z"),
      isAllDay: false,
      sourceEventId: "gid-1",
      startTime: new Date("2026-09-01T09:00:00.000Z"),
      title: "Meet",
      uid: "shared@s5",
    };
    const uidCopy: SourceEvent = {
      endTime: new Date("2026-09-01T10:00:00.000Z"),
      isAllDay: false,
      startTime: new Date("2026-09-01T09:00:00.000Z"),
      title: "Meet",
      uid: "shared@s5",
    };
    const store: StoredRow[] = [];
    const feed = [providerCopy, uidCopy];
    await runIngestRound(calendarId, store, feed);
    for (let round = 0; round < 4; round += 1) {
      const steady = await runIngestRound(calendarId, store, feed);
      expect([steady.added, steady.removed]).toEqual([0, 0]);
    }
  });
});
