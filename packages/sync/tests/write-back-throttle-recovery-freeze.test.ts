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
} from "@keeper.sh/calendar";
import type {
  CalendarSourceWriter,
  InboundClassification,
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
  WriteBackStore,
  WriteBackTarget,
} from "../src/write-back-pass";

const client = new PGlite();
const database = drizzle(client);

const MAPPING_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const EVENT_STATE_ID = "event-state-id-1";
const SOURCE_EVENT_UID = "source-event-uid-1";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const MOVED_START_TIME = new Date("2027-05-11T17:00:00.000Z");
const MOVED_END_TIME = new Date("2027-05-11T18:00:00.000Z");
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const THROTTLED_PASSES = 4;
const FIRST = 1;
const NONE = 0;

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
  "writeBackLastAppliedAt" timestamptz
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

const createWriteBack = (): InboundClassification => ({
  expectedSource: { endTime: END_TIME, isAllDay: false, startTime: START_TIME },
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  observed: {
    availability: "busy",
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
  type: "write-back",
  updates: { summary: "Edited on the copy" },
});

/* The production epoch assignment, on the real row. */
const commitUpdate = async (): Promise<{
  writeBackAppliedCount: number;
  writeBackDailyCount: number;
}> => {
  const [row] = await database
    .update(eventMappingsTable)
    .set(buildEpochAssignment())
    .where(eq(eventMappingsTable.id, MAPPING_ID))
    .returning({ writeBackAppliedCount: eventMappingsTable.writeBackAppliedCount });
  return {
    writeBackAppliedCount: row?.writeBackAppliedCount ?? NONE,
    writeBackDailyCount: FIRST,
  };
};

const createHarness = () => {
  const quarantines: string[] = [];
  const writerCalls: string[] = [];

  const writer: CalendarSourceWriter = {
    deleteEvent: () => Promise.resolve({ success: true }),
    updateEvent: () => {
      writerCalls.push("update");
      return Promise.resolve({ success: true });
    },
  };

  const locked: LockedWriteBackStore = {
    commitDelete: () => Promise.resolve(),
    commitUpdate,
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: PUSHED_HASH }),
    readPairWriteBack: () =>
      Promise.resolve({ writeBackMode: "edits", writeBackState: "ok" }),
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
  };

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
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => run(locked),
  };

  return {
    quarantines,
    run: () =>
      runWriteBackPass({
        calendarId: DESTINATION_CALENDAR_ID,
        classifications: [createWriteBack()],
        store: passStore,
      }),
    writerCalls,
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

const createMapping = (
  event: MaterializedSyncableEvent,
  budget: MappingBudget,
) => ({
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

const readBudget = async (): Promise<MappingBudget> => {
  const [row] = await database
    .select({
      writeBackAppliedCount: eventMappingsTable.writeBackAppliedCount,
      writeBackEpoch: eventMappingsTable.writeBackEpoch,
      writeBackEpochWindowStart: eventMappingsTable.writeBackEpochWindowStart,
      writeBackLastAppliedAt: eventMappingsTable.writeBackLastAppliedAt,
    })
    .from(eventMappingsTable)
    .where(eq(eventMappingsTable.id, MAPPING_ID))
    .limit(FIRST);
  return {
    writeBackAppliedCount: row?.writeBackAppliedCount ?? NONE,
    writeBackEpoch: row?.writeBackEpoch ?? NONE,
    writeBackEpochWindowStart: row?.writeBackEpochWindowStart ?? null,
    writeBackLastAppliedAt: row?.writeBackLastAppliedAt ?? null,
  };
};

beforeEach(async () => {
  await client.exec(`drop table if exists event_mappings cascade;`);
  await client.exec(DDL);
  await client.query(`insert into event_mappings ("id") values ($1)`, [MAPPING_ID]);
});

/*
 * One edit written back, a burst of provider throttling, one more edit written back once
 * the throttle lifts. Both edits reached the source; nothing ran away and nobody was told
 * anything stopped. The mapping must still be able to carry the edit the user makes next.
 */
const runThrottleRecovery = async (): Promise<string[]> => {
  const first = createHarness();
  await first.run();
  for (let pass = NONE; pass < THROTTLED_PASSES; pass += FIRST) {
    await store.recordFailure(MAPPING_ID, "rejected");
  }
  const recovery = createHarness();
  await recovery.run();

  expect(recovery.writerCalls).toEqual(["update"]);
  return [...first.quarantines, ...recovery.quarantines];
};

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const adoptedDestinationStartTime = (
  classification: InboundClassification,
): Date | null => {
  if (!("mappingUpdate" in classification)) {
    return null;
  }
  return classification.mappingUpdate?.destinationStartTime ?? null;
};

describe("an edit, a throttle, and the edit that lands after it", () => {
  it("does not freeze the mapping for good once the throttle has lifted", async () => {
    const quarantines = await runThrottleRecovery();

    expect(quarantines).toEqual([]);

    const budget = await readBudget();
    const later = new Date(Date.now() + TWO_HOURS_MS);

    expect(classifyNextEdit(budget, later).classifications)
      .toMatchObject([{ type: "write-back" }]);
  });

  /*
   * The edit either reaches the source or is handed back to the one-way repair. What must
   * never happen is the third thing: the copy's values adopted as the new baseline while
   * the mapping is also held out of the repair, which leaves the two calendars permanently
   * disagreeing with nothing anywhere left to notice.
   */
  it("does not silently adopt the swallowed edit as the new baseline", async () => {
    await runThrottleRecovery();
    const budget = await readBudget();

    const result = classifyNextEdit(budget, new Date(Date.now() + TWO_HOURS_MS));

    expect({
      carriesTheEdit: result.classifications.map(({ type }) => type),
      swallowsTheEdit: result.classifications.some((classification) =>
        classification.type !== "write-back"
        && adoptedDestinationStartTime(classification) instanceof Date
        && result.suppressedMappingIds.includes(MAPPING_ID)),
    }).toEqual({ carriesTheEdit: ["write-back"], swallowsTheEdit: false });
  });

  it("still carries the second edit when no throttle came between them", async () => {
    await createHarness().run();
    await createHarness().run();
    const budget = await readBudget();

    expect(
      classifyNextEdit(budget, new Date(Date.now() + TWO_HOURS_MS))
        .classifications.map(({ type }) => type),
    ).toEqual(["write-back"]);
  });
});
