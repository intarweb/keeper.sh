import { describe, expect, it } from "vitest";
import { TWO_WAY_EPOCH_QUARANTINE_LIMIT } from "@keeper.sh/calendar";
import type { CalendarSourceWriter, InboundClassification } from "@keeper.sh/calendar";
import { runWriteBackPass } from "../src/write-back-pass";
import type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackStore,
  WriteBackTarget,
} from "../src/write-back-pass";

/*
 * The source ingest and the write-back applier take the same advisory lock, and the
 * applier takes it under a 30 second statement_timeout. A CalDAV source ingest holds that
 * lock across its whole network fetch, so a slow or large source calendar makes the lock
 * acquisition itself time out. Verified against postgres 17: the contending transaction
 * raises after 30_022ms with exactly this message shape and no status of any kind.
 */
const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const MAPPING_ID = "mapping-id-1";
const EVENT_STATE_ID = "event-state-id-1";
const SOURCE_EVENT_UID = "source-event-uid-1";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const MOVED_START_TIME = new Date("2027-05-11T17:00:00.000Z");
const MOVED_END_TIME = new Date("2027-05-11T18:00:00.000Z");
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const NO_CALLS = 0;

const createLockTimeout = (): Error =>
  new Error(
    "Failed query: select pg_advisory_xact_lock($1, hashtext($2))\n"
    + `params: 9003,${SOURCE_CALENDAR_ID}`,
  );

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
  deleteIdentifier: "destination-delete-id",
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  destinationEventUid: "destination-event-uid",
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
    endTime: MOVED_END_TIME,
    isAllDay: false,
    location: "Room 4",
    startTime: MOVED_START_TIME,
    summary: "Quarterly review",
  },
  projectedSyncEventHash: "projected-hash",
  sourceEventUid: SOURCE_EVENT_UID,
  type: "write-back",
  updates: { endTime: MOVED_END_TIME, isAllDay: false, startTime: MOVED_START_TIME },
});

const createDelete = (): InboundClassification => ({
  expectedSource: {
    description: "Bring the notes",
    endTime: END_TIME,
    isAllDay: false,
    location: "Room 4",
    startTime: START_TIME,
    summary: "Quarterly review",
  },
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  sourceEventUid: SOURCE_EVENT_UID,
  type: "delete",
});

interface HarnessOptions {
  commitDeleteFailure?: () => Error;
  lockFailure?: () => Error;
  writerFailure?: { error: string; retryable: boolean };
}

const createHarness = (options: HarnessOptions = {}) => {
  const tombstones = new Map<string, { state: string }>();
  const quarantines: string[] = [];
  const writerCalls: string[] = [];
  let epoch = 0;
  let tombstoneCounter = 0;

  const writer: CalendarSourceWriter = {
    deleteEvent: () => {
      writerCalls.push("delete");
      if (options.writerFailure) {
        return Promise.resolve({ ...options.writerFailure, success: false });
      }
      return Promise.resolve({ success: true });
    },
    updateEvent: () => {
      writerCalls.push("update");
      if (options.writerFailure) {
        return Promise.resolve({ ...options.writerFailure, success: false });
      }
      return Promise.resolve({ success: true });
    },
  };

  const locked: LockedWriteBackStore = {
    commitDelete: ({ tombstoneId }) => {
      const failure = options.commitDeleteFailure;
      if (failure) {
        throw failure();
      }
      tombstones.set(tombstoneId, { state: "applied" });
      return Promise.resolve();
    },
    commitUpdate: () => Promise.resolve({ writeBackEpoch: 1 }),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: PUSHED_HASH }),
    readPairWriteBack: () =>
      Promise.resolve({ writeBackMode: "edits_and_deletes", writeBackState: "ok" }),
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
  };

  const store: WriteBackStore = {
    abandonTombstone: ({ tombstoneId }) => {
      tombstones.set(tombstoneId, { state: "abandoned" });
      return Promise.resolve();
    },
    countRecentDeletes: () =>
      Promise.resolve([...tombstones.values()].filter((row) => row.state !== "abandoned").length),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    probeDestinationEvent: () => Promise.resolve("absent"),
    quarantineMapping: (_sourceCalendarId, _destinationCalendarId, reason) => {
      quarantines.push(reason);
      return Promise.resolve();
    },
    readSourceEvent: () => Promise.resolve(createSourceEvent()),
    recordFailure: (_mappingId, outcome) => {
      if (outcome === "abandoned") {
        return Promise.resolve(1);
      }
      epoch += 1;
      return Promise.resolve(epoch);
    },
    recordTombstone: () => {
      tombstoneCounter += 1;
      const id = `tombstone-${tombstoneCounter}`;
      tombstones.set(id, { state: "pending" });
      return Promise.resolve({ id, observedAt: new Date(), priorAttempt: false });
    },
    requestDeleteConfirmation: () => Promise.resolve(),
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: async (_sourceCalendarId, run) => {
      const failure = options.lockFailure;
      if (failure) {
        throw failure();
      }
      return await run(locked);
    },
  };

  return { quarantines, store, tombstones, writerCalls };
};

const runPasses = async (
  store: WriteBackStore,
  classification: InboundClassification,
  passes: number,
): Promise<void> => {
  for (let pass = 0; pass < passes; pass += 1) {
    await runWriteBackPass({
      calendarId: DESTINATION_CALENDAR_ID,
      classifications: [classification],
      store,
    });
  }
};

/*
 * The lock the applier could not take is the source ingest holding it, which is the
 * provider being read rather than the provider refusing a write. Nothing was sent to any
 * calendar and the next pass settles it — exactly what the longer failure budget is for.
 * Spending it as a permanent defect reverts the pair to one-way after five passes and
 * throws away the edit the user made on the copy, with nothing retried once the pair is
 * off.
 */
describe("a source lock the ingest was holding is not a permanent defect", () => {
  it("does not revert the pair to one-way after five contended passes", async () => {
    const harness = createHarness({ lockFailure: createLockTimeout });

    await runPasses(harness.store, createWriteBack(), TWO_WAY_EPOCH_QUARANTINE_LIMIT);

    expect(harness.quarantines).toEqual([]);
  });

  it("treats it the same way it already treats a provider that answered 503", async () => {
    const harness = createHarness({
      writerFailure: { error: "Service Unavailable", retryable: true },
    });

    await runPasses(harness.store, createWriteBack(), TWO_WAY_EPOCH_QUARANTINE_LIMIT);

    expect(harness.quarantines).toEqual([]);
  });
});

/*
 * The record of a deletion is committed before the lock is taken, so a lock that was never
 * taken has to release it: the writer provably never ran, no source event was destroyed,
 * and a record left standing spends one of the day's fifty deletion slots on a deletion
 * that never happened. Enough of them refuse the real deletions that follow and tell the
 * user their originals were deleted in bulk when none of them were.
 */
describe("a deletion whose lock timed out did not delete anything", () => {
  it("releases the record when the writer was never reached", async () => {
    const harness = createHarness({ lockFailure: createLockTimeout });

    await runPasses(harness.store, createDelete(), 1);

    expect(harness.writerCalls.length).toBe(NO_CALLS);
    expect([...harness.tombstones.values()]).toEqual([{ state: "abandoned" }]);
  });

  /*
   * The mirror image, and the reason the release is not simply "any untyped error". Once
   * the delete has left, a database failure on the local commit says nothing about whether
   * the real event survived, so the record stands.
   */
  it("keeps the record standing when the delete had already left", async () => {
    const harness = createHarness({
      commitDeleteFailure: () => new Error("Failed query: update event_mappings"),
    });

    await runPasses(harness.store, createDelete(), 1);

    expect(harness.writerCalls).toEqual(["delete"]);
    expect([...harness.tombstones.values()]).toEqual([{ state: "pending" }]);
  });
});
