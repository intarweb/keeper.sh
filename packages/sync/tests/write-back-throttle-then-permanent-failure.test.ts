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
const THROTTLED_PASSES = 4;
const PERMANENT_PASSES = 4;
const FIRST = 1;
const NONE = 0;

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
 * The production lock is transaction scoped, so a write the provider then rejects rolls the
 * budget reservation back with everything else the transaction touched. Modelling that is
 * the whole point: without it the landed-write assignment would be counted for a write that
 * never landed and the run would not be the one production performs.
 */
type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

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

type WriterAnswer =
  | { error: string; retryable: boolean; success: false }
  | { success: true };

/*
 * A provider throttle answers "not right now" — the same answer a 503 gives, and the one
 * the applier already retries thirty times. A 404 on the lookup answers "never" and is
 * allowed five. They are different budgets on purpose.
 */
const THROTTLED: WriterAnswer = {
  error: "Rate limit exceeded.",
  retryable: true,
  success: false,
};

const PERMANENT: WriterAnswer = {
  error: "Event not found on Google.",
  retryable: false,
  success: false,
};

const createHarness = (answer: WriterAnswer) => {
  const quarantines: string[] = [];

  const writer: CalendarSourceWriter = {
    deleteEvent: () => Promise.resolve({ success: true }),
    updateEvent: () => Promise.resolve(answer),
  };

  const lockedOn = (transaction: Transaction): LockedWriteBackStore => ({
    commitDelete: () => Promise.resolve(),
    commitUpdate: commitUpdateOn(transaction),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: PUSHED_HASH }),
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
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) =>
      database.transaction((transaction) => run(lockedOn(transaction))),
  };

  return {
    quarantines,
    run: () =>
      runWriteBackPass({
        calendarId: DESTINATION_CALENDAR_ID,
        classifications: [createWriteBack()],
        store: passStore,
      }),
  };
};

const runPasses = async (answer: WriterAnswer, count: number): Promise<string[]> => {
  const seen: string[] = [];
  for (let pass = NONE; pass < count; pass += FIRST) {
    const harness = createHarness(answer);
    await harness.run();
    seen.push(...harness.quarantines);
  }
  return seen;
};

const readBudgets = async (): Promise<{ epoch: number; permanent: number }> => {
  const [row] = await database
    .select({
      writeBackEpoch: eventMappingsTable.writeBackEpoch,
      writeBackPermanentCount: eventMappingsTable.writeBackPermanentCount,
    })
    .from(eventMappingsTable)
    .where(eq(eventMappingsTable.id, MAPPING_ID))
    .limit(FIRST);
  return {
    epoch: row?.writeBackEpoch ?? NONE,
    permanent: row?.writeBackPermanentCount ?? NONE,
  };
};

beforeEach(async () => {
  await client.exec(`drop table if exists event_mappings cascade;`);
  await client.exec(DDL);
  await client.query(`insert into event_mappings ("id") values ($1)`, [MAPPING_ID]);
});

describe("write-back budgets after a throttle", () => {
  it("does not spend the permanent-failure budget on a provider throttle", async () => {
    const throttled = await runPasses(THROTTLED, THROTTLED_PASSES);
    expect(throttled).toEqual([]);

    const permanent = await runPasses(PERMANENT, FIRST);
    expect(permanent).toEqual([]);
  });

  it("still reverts the pair once the permanent failures are its own", async () => {
    const early = await runPasses(PERMANENT, PERMANENT_PASSES);
    expect(early).toEqual([]);

    const last = await runPasses(PERMANENT, FIRST);
    expect(last).toEqual(["write_back_failing"]);
  });

  it("counts a throttle apart from the column the permanent limit reads", async () => {
    await runPasses(THROTTLED, THROTTLED_PASSES);

    expect(await readBudgets()).toEqual({
      epoch: THROTTLED_PASSES,
      permanent: NONE,
    });
  });

  /*
   * The retry budget is the one the classifier reads to stop handing a mapping work, so it
   * must be the applier that spends its last unit — never a throttle leaving the count one
   * short and a permanent answer carrying it over with nothing said.
   */
  it("leaves the retry budget where a permanent failure found it", async () => {
    await runPasses(THROTTLED, THROTTLED_PASSES);
    await runPasses(PERMANENT, FIRST);

    expect(await readBudgets()).toEqual({
      epoch: THROTTLED_PASSES,
      permanent: FIRST,
    });
  });
});
