import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { CalendarSourceWriter, InboundClassification } from "@keeper.sh/calendar";
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
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const NOW = new Date("2027-05-01T09:00:00.000Z");
const OUTAGE_PASSES = 4;
const FIRST = 1;

const DDL = `
create table event_mappings (
  "id" uuid primary key,
  "writeBackAbandonCount" integer not null default 0,
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

/*
 * The two things this store does for real, both against the row the outage left behind:
 * the epoch a landed write is assigned by the production assignment, and the limit that
 * epoch is judged by by the production rule — read before the assignment overwrites the
 * stamps it depends on, exactly as the real commit does.
 */
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
    writeBackAppliedCount: row?.writeBackAppliedCount ?? 0,
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
      Promise.resolve({ writeBackMode: "edits_and_deletes", writeBackState: "ok" }),
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
  };

  const passStore: WriteBackStore = {
    abandonTombstone: () => Promise.resolve(),
    countRecentDeletes: () => Promise.resolve(0),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    quarantineMapping: (_source, _destination, reason) => {
      quarantines.push(reason);
      return Promise.resolve();
    },
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
    recordFailure: (mappingId, outcome) => store.recordFailure(mappingId, outcome),
    recordTombstone: () =>
      Promise.resolve({ id: "tombstone-1", observedAt: NOW, priorAttempt: false }),
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => run(locked),
  };

  return {
    quarantines,
    run: () =>
      runWriteBackPass({
        calendarId: DESTINATION_CALENDAR_ID,
        classifications: [createWriteBack()],
        now: () => NOW,
        store: passStore,
      }),
    writerCalls,
  };
};

beforeEach(async () => {
  await client.exec(`drop table if exists event_mappings cascade;`);
  await client.exec(DDL);
  await client.query(
    `insert into event_mappings
       ("id", "writeBackEpoch", "writeBackEpochWindowStart", "writeBackLastAppliedAt")
     values ($1, 1, now() - interval '100 seconds', now() - interval '100 seconds')`,
    [MAPPING_ID],
  );
});

/*
 * The epoch column counts two different things, and the classifier already knows it: a spend
 * the provider rejected reached no calendar, so a mapping whose last landed write is older
 * than the window the rejections opened is judged by the failure budget of thirty rather
 * than by the five a landed write is allowed. The applier judges the same column by the bare
 * five, so the write that finally lands once a throttle lifts is read as the fifth in a
 * runaway and reverts the pair to one-way — for a write the user asked for, on a mapping
 * that wrote back exactly twice.
 */
describe("a write that lands after a provider outage is not a runaway", () => {
  it("leaves the pair two-way when the epoch was spent on rejections", async () => {
    for (let pass = 0; pass < OUTAGE_PASSES; pass += FIRST) {
      await store.recordFailure(MAPPING_ID, "rejected");
    }
    const harness = createHarness();

    const result = await harness.run();

    expect(harness.writerCalls).toEqual(["update"]);
    expect(result.applied).toBe(FIRST);
    expect(harness.quarantines).toEqual([]);
  });
});
