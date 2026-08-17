import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { CalendarSourceWriter, InboundClassification } from "@keeper.sh/calendar";
import { createDatabaseWriteBackStore } from "../src/write-back";
import { runWriteBackPass } from "../src/write-back-pass";
import type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackStore,
  WriteBackTarget,
} from "../src/write-back-pass";

const client = new PGlite();
const database = drizzle(client);

const USER_ID = "user-id";
const SOURCE_CALENDAR_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_CALENDAR_ID = "22222222-2222-4222-8222-222222222222";
const MAPPING_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_STATE_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_EVENT_UID = "source-event-uid-1";
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const NONE = 0;
const WITHDRAWN_CONSENT = "off";
const SLOW_LOCKED_READ_MS = 20;
const SECOND_WORKER_DELAY_MS = 5;

const DDL = `
create table event_write_back_tombstones (
  "id" uuid primary key default gen_random_uuid(),
  "appliedAt" timestamptz not null default now(),
  "destinationCalendarId" uuid not null,
  "eventMappingId" uuid not null,
  "eventStateId" uuid,
  "expiresAt" timestamptz not null,
  "observedAt" timestamptz,
  "snapshot" jsonb not null,
  "sourceCalendarId" uuid not null,
  "sourceEventUid" text not null,
  "state" text not null,
  "userId" text not null
);
create unique index event_write_back_tombstones_mapping_idx
  on event_write_back_tombstones ("eventMappingId");
`;

const SNAPSHOT: SourceEventSnapshot = {
  description: "Bring the notes",
  endTime: new Date("2027-05-11T15:00:00.000Z"),
  isAllDay: false,
  location: "Room 4",
  startTime: new Date("2027-05-11T14:00:00.000Z"),
  startTimeZone: "America/Toronto",
  title: "Quarterly review",
};

const target: WriteBackTarget = {
  deleteIdentifier: "destination-delete-id-1",
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  destinationEventUid: "destination-uid-1",
  eventStateId: EVENT_STATE_ID,
  mappingId: MAPPING_ID,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  sourceEventId: null,
  sourceEventUid: SOURCE_EVENT_UID,
};

const deleteClassification: InboundClassification = {
  expectedSource: {
    description: "Bring the notes",
    endTime: SNAPSHOT.endTime,
    isAllDay: false,
    location: "Room 4",
    startTime: SNAPSHOT.startTime,
    summary: "Quarterly review",
  },
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  sourceEventUid: SOURCE_EVENT_UID,
  type: "delete",
};

const realStore = createDatabaseWriteBackStore({
  database: database as unknown as BunSQLDatabase,
  encryptionKey: "encryption-key",
  oauthConfig: {},
  userId: USER_ID,
} as never);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/*
 * The source ingest lock, modelled as what it is in production: one pass inside the locked
 * region at a time, the other waiting its turn.
 */
const settle = async (result: Promise<unknown>): Promise<void> => {
  await Promise.allSettled([result]);
};

const createLock = () => {
  let tail = Promise.resolve();
  return <TResult>(run: () => Promise<TResult>): Promise<TResult> => {
    const result = tail.then(run);
    tail = settle(result);
    return result;
  };
};

const readTombstoneStates = async (): Promise<string[]> => {
  const rows = await client.query<{ state: string }>(
    `select "state" from event_write_back_tombstones where "eventMappingId" = $1`,
    [MAPPING_ID],
  );
  return rows.rows.map((row) => row.state);
};

/*
 * Two workers over the same destination, both turning back before the provider is asked.
 * The pair's authority is re-read under the lock and it no longer authorises the deletion —
 * the user switched two-way sync off in the seconds after the classification was made — so
 * the writer provably never ran on either pass. Nothing on the source was destroyed, and no
 * record of a destruction may be left behind.
 */
interface SharedMappingRow {
  deleted: boolean;
}

const createWorker = (options: {
  mapping: SharedMappingRow;
  withLock: <TResult>(run: () => Promise<TResult>) => Promise<TResult>;
  writeBackMode: string;
  writerCalls: string[];
}) => {
  const writer: CalendarSourceWriter = {
    deleteEvent: () => {
      options.writerCalls.push("delete");
      return Promise.resolve({ success: true });
    },
    updateEvent: () => Promise.resolve({ success: true }),
  };

  const locked: LockedWriteBackStore = {
    /*
     * Production's commitDelete removes the event_mappings row, so a second pass over the
     * same mapping finds nothing to write to and turns back.
     */
    commitDelete: async ({ tombstoneId }) => {
      options.mapping.deleted = true;
      await client.query(
        `update event_write_back_tombstones
         set "state" = 'applied', "appliedAt" = now() where "id" = $1`,
        [tombstoneId],
      );
    },
    commitUpdate: () =>
      Promise.resolve({ writeBackAppliedCount: NONE, writeBackDailyCount: NONE }),
    readMappingSyncEventHash: () => {
      if (options.mapping.deleted) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ syncEventHash: PUSHED_HASH });
    },
    /*
     * The first read taken inside the locked region, and in production a query against a
     * pool the other worker is also using. Holding here is what lets the second worker
     * reach its own tombstone record while the first is still inside the lock.
     */
    readPairWriteBack: async () => {
      await wait(SLOW_LOCKED_READ_MS);
      return { writeBackMode: options.writeBackMode, writeBackState: "ok" };
    },
    readSourceEvent: () => Promise.resolve(SNAPSHOT),
  };

  const passStore: WriteBackStore = {
    abandonTombstone: realStore.abandonTombstone,
    countRecentDeletes: realStore.countRecentDeletes,
    loadTarget: () => Promise.resolve(target),
    notifySiblings: () => Promise.resolve(),
    probeDestinationEvent: () => Promise.resolve("absent"),
    quarantineMapping: () => Promise.resolve(),
    readSourceEvent: () => Promise.resolve(SNAPSHOT),
    recordFailure: () => Promise.resolve(NONE),
    recordTombstone: realStore.recordTombstone,
    requestDeleteConfirmation: () => Promise.resolve(),
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => options.withLock(() => run(locked)),
  };

  return () =>
    runWriteBackPass({
      calendarId: DESTINATION_CALENDAR_ID,
      classifications: [deleteClassification],
      store: passStore,
    });
};

const runTwoWorkers = async (writeBackMode: string): Promise<string[]> => {
  const writerCalls: string[] = [];
  const withLock = createLock();
  const mapping: SharedMappingRow = { deleted: false };
  const first = createWorker({ mapping, withLock, writeBackMode, writerCalls });
  const second = createWorker({ mapping, withLock, writeBackMode, writerCalls });

  const firstRun = first();
  await wait(SECOND_WORKER_DELAY_MS);
  await Promise.all([firstRun, second()]);

  return writerCalls;
};

describe("two passes that both turn back leave no record of a deletion", () => {
  beforeAll(async () => {
    await client.exec(DDL);
  });

  beforeEach(async () => {
    await client.exec("delete from event_write_back_tombstones");
  });

  it("releases the record when neither pass reached the writer", async () => {
    const writerCalls = await runTwoWorkers(WITHDRAWN_CONSENT);

    expect(writerCalls).toEqual([]);
    expect(await readTombstoneStates()).toEqual(["abandoned"]);
  });

  it("does not spend the source calendar's daily deletion budget on them", async () => {
    await runTwoWorkers(WITHDRAWN_CONSENT);

    const spent = await realStore.countRecentDeletes(
      SOURCE_CALENDAR_ID,
      new Date("2000-01-01T00:00:00.000Z"),
    );

    expect(spent).toBe(NONE);
  });

  /*
   * The control. The same two overlapping workers, with the pair still authorising the
   * deletion: exactly one of them reaches the provider and the record it leaves is the
   * completed deletion it really is.
   */
  it("still deletes exactly once when the pair does authorize it", async () => {
    const writerCalls = await runTwoWorkers("edits_and_deletes");

    expect(writerCalls).toEqual(["delete"]);
    expect(await readTombstoneStates()).toEqual(["applied"]);
  });
});
