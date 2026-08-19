import { describe, expect, it } from "vitest";
import { eventStatesTable } from "@keeper.sh/database/schema";
import type { SourceEvent } from "../../../src/core/types";
import type { EventStateInsertRow } from "../../../src/core/source/write-event-states";
import {
  buildEventStateInsertRow,
  insertEventStatesWithConflictResolution,
} from "../../../src/core/source/write-event-states";
import {
  buildSourceEventsToAdd,
  buildSourceEventStateIdsToRemove,
} from "../../../src/core/source/event-diff";
import { parseStoredSourceEventStatesRecoveringInvalid } from "../../../src/core/source/stored-event-state";

/*
 * The diff decides whether a one-off legacy event is an unambiguous reschedule
 * by counting same-UID candidates across the WHOLE incoming feed
 * (event-diff.ts isUnambiguousReschedule), but the write path re-derives that
 * decision by counting only the rows in the INSERT BATCH
 * (write-event-states.ts partitionRescheduleCandidates). A feed carrying two
 * one-off events with the same UID at different times — duplicate-UID feeds
 * exist in the wild — makes the two disagree: the unchanged copy never enters
 * the batch, so the batch count is one, the write path treats the genuinely
 * NEW second event as a reschedule of the stored first one, and rewrites the
 * stored row in place. Every subsequent ingest over the byte-identical feed
 * then re-adds whichever copy was just destroyed and destroys the other:
 * permanent alternation, never a no-op, with one of the two events always
 * missing.
 */

const CALENDAR_ID = "calendar-1";

const FIRST_COPY: SourceEvent = {
  isAllDay: false,
  endTime: new Date("2026-09-01T11:00:00.000Z"),
  startTime: new Date("2026-09-01T10:00:00.000Z"),
  title: "Planning (morning copy)",
  uid: "dup-uid-1",
};

const SECOND_COPY: SourceEvent = {
  isAllDay: false,
  endTime: new Date("2026-09-01T13:00:00.000Z"),
  startTime: new Date("2026-09-01T12:00:00.000Z"),
  title: "Planning (noon copy)",
  uid: "dup-uid-1",
};

interface StoredRow extends EventStateInsertRow {
  id: string;
}

const isLegacyNonRecurringRow = (row: StoredRow): boolean =>
  !row.sourceEventId && !row.recurrenceId;

/*
 * Postgres stores every absent optional column as NULL, so the fake store
 * normalizes rows the same way regardless of whether they arrived via the
 * insert path (absent keys) or the in-place update path (explicit nulls).
 * Without this the two paths would produce spuriously different identity
 * keys on the next pass — an artifact no real database exhibits.
 */
const toStoredShape = (row: EventStateInsertRow): EventStateInsertRow => ({
  ...row,
  availability: row.availability ?? null,
  description: row.description ?? null,
  exceptionDates: row.exceptionDates ?? null,
  isAllDay: row.isAllDay ?? null,
  location: row.location ?? null,
  recurrenceId: row.recurrenceId ?? null,
  recurrenceRule: row.recurrenceRule ?? null,
  sourceEventId: row.sourceEventId ?? null,
  sourceEventType: row.sourceEventType ?? "default",
  startTimeZone: row.startTimeZone ?? null,
  title: row.title ?? null,
});

describe("repeat ingest of a feed holding two same-UID one-off events", () => {
  it("converges to a no-op instead of alternating which copy is stored", async () => {
    let stored: StoredRow[] = [];
    let nextRowId = 0;

    /*
     * In-memory stand-in for the flush transaction client: upserts honour the
     * legacy non-recurring unique index (calendarId, uid, startTime, endTime),
     * the reschedule probe select returns the legacy rows the real query
     * matches, and the in-place update lands on the row the probe resolved
     * (the only legacy row holding that UID).
     */
    const fakeClient = {
      insert: () => ({
        values: (value: EventStateInsertRow | EventStateInsertRow[]) => ({
          onConflictDoUpdate: () => {
            let rows = value;
            if (!Array.isArray(rows)) {
              rows = [rows];
            }
            for (const row of rows) {
              const conflictingRow = stored.find((candidate) =>
                isLegacyNonRecurringRow(candidate)
                && candidate.calendarId === row.calendarId
                && candidate.sourceEventUid === row.sourceEventUid
                && candidate.startTime.getTime() === row.startTime.getTime()
                && candidate.endTime.getTime() === row.endTime.getTime());
              if (conflictingRow) {
                Object.assign(conflictingRow, toStoredShape(row));
              } else {
                nextRowId += 1;
                stored.push({ ...toStoredShape(row), id: `row-${String(nextRowId)}` });
              }
            }
            return Promise.resolve();
          },
        }),
      }),
      select: () => ({
        from: (table: typeof eventStatesTable) => ({
          where: () => {
            expect(table).toBe(eventStatesTable);
            return Promise.resolve(
              stored
                .filter((row) => isLegacyNonRecurringRow(row))
                .map((row) => ({ id: row.id, sourceEventUid: row.sourceEventUid ?? null })),
            );
          },
        }),
      }),
      update: (table: typeof eventStatesTable) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            expect(table).toBe(eventStatesTable);
            const targets = stored.filter((row) =>
              isLegacyNonRecurringRow(row) && row.sourceEventUid === values["sourceEventUid"]);
            expect(targets).toHaveLength(1);
            const [target] = targets;
            if (target) {
              Object.assign(target, values);
            }
            return Promise.resolve();
          },
        }),
      }),
    };

    const runIngestPass = async (
      incoming: SourceEvent[],
    ): Promise<{ added: number; removed: number }> => {
      const parseResult = parseStoredSourceEventStatesRecoveringInvalid(
        stored.map((row) => ({
          ...row,
          exceptionDates: row.exceptionDates ?? null,
          recurrenceId: row.recurrenceId ?? null,
          recurrenceRule: row.recurrenceRule ?? null,
          sourceEventId: row.sourceEventId ?? null,
          sourceEventType: row.sourceEventType ?? null,
          sourceEventUid: row.sourceEventUid ?? null,
          startTimeZone: row.startTimeZone ?? null,
        })),
      );
      expect(parseResult.failures).toHaveLength(0);
      const existingEvents = parseResult.events;
      const eventsToAdd = buildSourceEventsToAdd(existingEvents, incoming, { isDeltaSync: false });
      const eventStateIdsToRemove = buildSourceEventStateIdsToRemove(
        existingEvents,
        incoming,
        { isDeltaSync: false },
      );
      const removeIdSet = new Set(eventStateIdsToRemove);
      stored = stored.filter((row) => !removeIdSet.has(row.id));
      await insertEventStatesWithConflictResolution(
        fakeClient,
        eventsToAdd.map((event) => buildEventStateInsertRow(CALENDAR_ID, event)),
      );
      return { added: eventsToAdd.length, removed: eventStateIdsToRemove.length };
    };

    /* The feed first carries one copy, then upstream adds the duplicate-UID second copy. */
    await runIngestPass([FIRST_COPY]);
    expect(stored).toHaveLength(1);
    /* Harness fidelity premise: a repeat of an already-converged feed is a no-op. */
    const convergedRepeat = await runIngestPass([FIRST_COPY]);
    expect(convergedRepeat).toEqual({ added: 0, removed: 0 });
    await runIngestPass([FIRST_COPY, SECOND_COPY]);

    /*
     * From here on the upstream feed never changes, so ingest must converge:
     * both copies stored, and the next identical pass a no-op. Instead the
     * write path rewrites the lone stored row to whichever copy is currently
     * missing, so every pass "adds" one event and silently destroys the other.
     */
    const repeatPass = await runIngestPass([FIRST_COPY, SECOND_COPY]);
    expect(stored).toHaveLength(2);
    expect(repeatPass.added).toBe(0);
    expect(repeatPass.removed).toBe(0);
  });
});
