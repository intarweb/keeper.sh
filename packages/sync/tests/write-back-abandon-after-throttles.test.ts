import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import {
  classifyInboundChanges,
  createEditableEventContentHash,
  createSyncEventContentHash,
  normalizeText,
  resolveIsAllDayEvent,
  TWO_WAY_FAILURE_EPOCH_QUARANTINE_LIMIT,
} from "@keeper.sh/calendar";
import type {
  CalendarSourceWriter,
  MaterializedSyncableEvent,
  RemoteEvent,
} from "@keeper.sh/calendar";
import { eventMappingsTable } from "@keeper.sh/database/schema";
import { buildEpochAssignment, createDatabaseWriteBackStore } from "../src/write-back";
import type { WriteBackApplierConfig } from "../src/write-back";
import { runWriteBackPass } from "../src/write-back-pass";
import type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackPassResult,
  WriteBackStore,
  WriteBackTarget,
} from "../src/write-back-pass";

const client = new PGlite();
const database = drizzle(client);

const MAPPING_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const EVENT_STATE_ID = "event-state-id-1";
const SOURCE_EVENT_UID = "source-event-uid-1";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const MOVED_START_TIME = new Date("2027-05-11T17:00:00.000Z");
const MOVED_END_TIME = new Date("2027-05-11T18:00:00.000Z");
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const HASH_AFTER_THE_SOURCE_MOVED = "the-hash-of-an-event-that-has-since-changed";
const LAST_THROTTLED_PASS = TWO_WAY_FAILURE_EPOCH_QUARANTINE_LIMIT - 1;
const FIRST = 1;
const NONE = 0;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const TEST_WINDOW = {
  timeMax: new Date("2100-01-01T00:00:00.000Z"),
  timeMin: new Date("2000-01-01T00:00:00.000Z"),
};

const DDL = `
create table event_mappings (
  "id" uuid primary key,
  "writeBackAbandonCount" integer not null default 0,
  "writeBackDailyCount" integer not null default 0,
  "writeBackDailyWindowStart" timestamptz,
  "writeBackAppliedCount" integer not null default 0,
  "writeBackEpoch" integer not null default 0,
  "writeBackEpochWindowStart" timestamptz,
  "writeBackLastAppliedAt" timestamptz,
  "writeBackPermanentCount" integer not null default 0
);
`;

const store = createDatabaseWriteBackStore({
  database: database as unknown as BunSQLDatabase,
} as unknown as WriteBackApplierConfig);

const createSourceEvent = (): SourceEventSnapshot => ({
  description: "Bring the notes",
  endTime: END_TIME,
  isAllDay: null,
  location: "Room 4",
  startTime: START_TIME,
  startTimeZone: null,
  title: "Quarterly review",
});

const createTarget = (): WriteBackTarget => ({
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  eventStateId: EVENT_STATE_ID,
  mappingId: MAPPING_ID,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  sourceEventId: null,
  sourceEventUid: SOURCE_EVENT_UID,
});

const createWriteBack = () => ({
  expectedSource: { endTime: END_TIME, isAllDay: false, startTime: START_TIME },
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  observed: {
    availability: "busy" as const,
    contentHash: "observed-content-hash",
    description: "Bring the notes",
    endTime: END_TIME,
    isAllDay: false,
    location: "Room 4",
    startTime: START_TIME,
    summary: "Edited on the copy",
  },
  projectedSyncEventHash: "projected-hash",
  sourceEventUid: SOURCE_EVENT_UID,
  type: "write-back" as const,
  updates: { summary: "Edited on the copy" },
});

type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

/*
 * The production epoch assignment, on the real row and inside the pass's own transaction:
 * a write the provider then rejects rolls its budget reservation back exactly as
 * production's transaction-scoped source lock does.
 */
const commitUpdateOn = (transaction: Transaction) => async (): Promise<{
  writeBackAppliedCount: number;
  writeBackDailyCount: number;
}> => {
  const [row] = await transaction
    .update(eventMappingsTable)
    .set(buildEpochAssignment())
    .where(eq(eventMappingsTable.id, MAPPING_ID))
    .returning({ writeBackAppliedCount: eventMappingsTable.writeBackAppliedCount });
  return {
    writeBackAppliedCount: row?.writeBackAppliedCount ?? NONE,
    writeBackDailyCount: FIRST,
  };
};

/*
 * A throttled pass is the provider answering "not right now"; a moved source is the pass
 * answering "I cannot act on the classification I was given", which is what a long outage
 * makes likely — the ingest that was queued behind it lands first and the stored event is
 * no longer the one the classifier compared.
 */
const THROTTLED = {
  error: "Rate limit exceeded.",
  retryable: true,
  success: false as const,
};

const createHarness = (options: { sourceMoved: boolean }) => {
  const quarantines: string[] = [];
  const confirmations: string[] = [];

  const writer: CalendarSourceWriter = {
    deleteEvent: () => Promise.resolve({ success: true }),
    updateEvent: () => Promise.resolve(THROTTLED),
  };

  const storedHash = (): string => {
    if (options.sourceMoved) {
      return HASH_AFTER_THE_SOURCE_MOVED;
    }
    return PUSHED_HASH;
  };

  const lockedOn = (transaction: Transaction): LockedWriteBackStore => ({
    commitDelete: () => Promise.resolve(),
    commitUpdate: commitUpdateOn(transaction),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: storedHash() }),
    readPairWriteBack: () =>
      Promise.resolve({ writeBackMode: "edits", writeBackState: "ok" }),
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
  });

  const passStore: WriteBackStore = {
    abandonTombstone: () => Promise.resolve(),
    countRecentDeletes: () => Promise.resolve(NONE),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    quarantineMapping: (_source, _destination, reason) => {
      quarantines.push(reason);
      return Promise.resolve();
    },
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
    recordFailure: (mappingId, outcome) => store.recordFailure(mappingId, outcome),
    recordTombstone: () =>
      Promise.resolve({ id: "tombstone-1", observedAt: new Date(), priorAttempt: false }),
    requestDeleteConfirmation: (_source, _destination, reason) => {
      confirmations.push(reason);
      return Promise.resolve();
    },
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) =>
      database.transaction((transaction) => run(lockedOn(transaction))),
  };

  return {
    confirmations,
    quarantines,
    run: (): Promise<WriteBackPassResult> =>
      runWriteBackPass({
        calendarId: DESTINATION_CALENDAR_ID,
        classifications: [createWriteBack()],
        store: passStore,
      }),
  };
};

const createLocalEvent = (): MaterializedSyncableEvent => ({
  availability: "busy",
  calendarId: SOURCE_CALENDAR_ID,
  calendarName: "Personal",
  calendarUrl: null,
  description: "Bring the notes",
  endTime: END_TIME,
  eventStateId: EVENT_STATE_ID,
  id: EVENT_STATE_ID,
  location: "Room 4",
  sourceEventUid: SOURCE_EVENT_UID,
  startTime: START_TIME,
  summary: "Quarterly review",
});

interface MappingBudget {
  writeBackAppliedCount: number;
  writeBackEpoch: number;
  writeBackEpochWindowStart: Date | null;
  writeBackLastAppliedAt: Date | null;
}

const createMapping = (event: MaterializedSyncableEvent, budget: MappingBudget) => ({
  calendarId: DESTINATION_CALENDAR_ID,
  deleteIdentifier: "destination-delete-id-1",
  destinationAvailability: "busy" as const,
  destinationContentHash: createEditableEventContentHash(event),
  destinationDescription: normalizeText(event.description),
  destinationEndTime: event.endTime,
  destinationEventUid: "destination-uid-1",
  destinationIsAllDay: resolveIsAllDayEvent({
    endTime: event.endTime,
    startTime: event.startTime,
  }),
  destinationLocation: normalizeText(event.location),
  destinationStartTime: event.startTime,
  destinationSummary: normalizeText(event.summary),
  endTime: event.endTime,
  eventStateId: event.eventStateId ?? event.id,
  id: MAPPING_ID,
  missingFirstObservedAt: null,
  missingObservationCount: NONE,
  recurrenceId: null,
  recurrenceRule: null,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  startTime: event.startTime,
  syncEventHash: createSyncEventContentHash(event),
  syncEventId: event.id,
  writeBackDailyCount: NONE,
  writeBackDailyWindowStart: null,
  ...budget,
});

const createMovedRemoteEvent = (
  mapping: ReturnType<typeof createMapping>,
): RemoteEvent => ({
  deleteId: mapping.deleteIdentifier,
  editableAvailability: "busy",
  editableContentHash: createEditableEventContentHash(createLocalEvent()),
  editableFields: {
    description: "Bring the notes",
    isAllDay: false,
    location: "Room 4",
    summary: "Quarterly review",
  },
  endTime: MOVED_END_TIME,
  isKeeperEvent: true,
  startTime: MOVED_START_TIME,
  supportedAvailabilities: ["busy", "free"],
  uid: mapping.destinationEventUid,
});

const classifyNextEdit = (budget: MappingBudget, now: Date) => {
  const event = createLocalEvent();
  const mapping = createMapping(event, budget);
  return classifyInboundChanges({
    existingMappings: [mapping],
    localEvents: [event],
    now,
    remoteEvents: [createMovedRemoteEvent(mapping)],
    remoteRawItemCount: FIRST,
    scope: {
      authoritativeWindow: TEST_WINDOW,
      requestedWindow: TEST_WINDOW,
      writeBackPolicies: new Map([[SOURCE_CALENDAR_ID, {
        deleteApproved: false,
        destinationCalendarId: DESTINATION_CALENDAR_ID,
        excludeEventDescription: false,
        excludeEventLocation: false,
        excludeEventName: false,
        paused: false,
        sourceCalendarId: SOURCE_CALENDAR_ID,
        writeBackMode: "edits" as const,
      }]]),
    },
  });
};

interface FailureBudgets {
  abandons: number;
  budget: MappingBudget;
}

const readBudgets = async (): Promise<FailureBudgets> => {
  const [row] = await database
    .select({
      writeBackAbandonCount: eventMappingsTable.writeBackAbandonCount,
      writeBackAppliedCount: eventMappingsTable.writeBackAppliedCount,
      writeBackEpoch: eventMappingsTable.writeBackEpoch,
      writeBackEpochWindowStart: eventMappingsTable.writeBackEpochWindowStart,
      writeBackLastAppliedAt: eventMappingsTable.writeBackLastAppliedAt,
    })
    .from(eventMappingsTable)
    .where(eq(eventMappingsTable.id, MAPPING_ID))
    .limit(FIRST);
  return {
    abandons: row?.writeBackAbandonCount ?? NONE,
    budget: {
      writeBackAppliedCount: row?.writeBackAppliedCount ?? NONE,
      writeBackEpoch: row?.writeBackEpoch ?? NONE,
      writeBackEpochWindowStart: row?.writeBackEpochWindowStart ?? null,
      writeBackLastAppliedAt: row?.writeBackLastAppliedAt ?? null,
    },
  };
};

const runThrottledPasses = async (count: number): Promise<string[]> => {
  const seen: string[] = [];
  for (let pass = NONE; pass < count; pass += FIRST) {
    const harness = createHarness({ sourceMoved: false });
    await harness.run();
    seen.push(...harness.quarantines);
  }
  return seen;
};

beforeEach(async () => {
  await client.exec(`drop table if exists event_mappings cascade;`);
  await client.exec(DDL);
  await client.query(`insert into event_mappings ("id") values ($1)`, [MAPPING_ID]);
});

/*
 * The provider throttles this mapping for as long as the retry budget allows, and then the
 * pass finds the source has moved under the classification and abandons. Each of those is
 * survivable on its own. What must not happen is the abandon spending the last of a budget
 * nothing is watching on that path: the classifier reads the same number to decide it will
 * never hand this mapping work again, adopts the destination's edited copy as the new
 * baseline and holds the mapping out of the one-way repair — one event frozen in both
 * directions for good, with the pair still reporting itself healthy.
 */
describe("an abandoned pass arriving at the end of a provider outage", () => {
  it("does not freeze the mapping with the pair still reporting ok", async () => {
    expect(await runThrottledPasses(LAST_THROTTLED_PASS)).toEqual([]);

    const harness = createHarness({ sourceMoved: true });
    const result = await harness.run();

    expect({
      abandoned: result.abandoned,
      confirmations: harness.confirmations,
      quarantines: harness.quarantines,
    }).toEqual({ abandoned: FIRST, confirmations: [], quarantines: [] });

    const { abandons, budget } = await readBudgets();

    expect({ abandons, epoch: budget.writeBackEpoch })
      .toEqual({ abandons: FIRST, epoch: LAST_THROTTLED_PASS });

    const later = new Date(Date.now() + TWO_HOURS_MS);
    const classified = classifyNextEdit(budget, later);

    /*
     * A mapping carrying a write-back is held out of the one-way repair on purpose, so
     * suppression alone is not the harm. The harm is suppression with the copy adopted as
     * the new baseline and no write-back left to carry it: the edit swallowed, both
     * calendars left disagreeing, and nothing anywhere to notice.
     */
    expect({
      carriesTheEdit: classified.classifications.map(({ type }) => type),
      swallowsTheEdit: classified.classifications.some((classification) =>
        classification.type !== "write-back"
        && classified.suppressedMappingIds.includes(MAPPING_ID)),
    }).toEqual({ carriesTheEdit: ["write-back"], swallowsTheEdit: false });
  });

  /*
   * The control: the budget still ends, and when it does the pair is reverted to one-way
   * with a reason the user can read rather than left to fail quietly.
   */
  it("still reverts the pair when the outage spends the budget itself", async () => {
    expect(await runThrottledPasses(LAST_THROTTLED_PASS)).toEqual([]);

    expect(await runThrottledPasses(FIRST)).toEqual(["write_back_failing"]);
  });

  /*
   * Why the two cases above have to hold: the number the applier reverts the pair on is the
   * same number the classifier reads to stop handing this mapping work. Anything else that
   * fills that column reaches this refusal without the revert, and the refusal on its own
   * is invisible — which is why nothing but the retry budget's own failures may spend it.
   */
  it("stops handing the mapping work at the very count the pair is reverted on", () => {
    const spent = classifyNextEdit({
      writeBackAppliedCount: NONE,
      writeBackEpoch: TWO_WAY_FAILURE_EPOCH_QUARANTINE_LIMIT,
      writeBackEpochWindowStart: new Date(),
      writeBackLastAppliedAt: new Date(),
    }, new Date(Date.now() + TWO_HOURS_MS));

    expect(spent.classifications).toMatchObject([
      { reason: "write_back_quarantined", type: "rejected" },
    ]);
  });
});
