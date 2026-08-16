import { describe, expect, it } from "vitest";
import type { CalendarSourceWriter, InboundClassification } from "@keeper.sh/calendar";
import { runWriteBackPass } from "../src/write-back-pass";
import type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackStore,
  WriteBackTarget,
} from "../src/write-back-pass";

const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const MAPPING_ID = "mapping-id-1";
const EVENT_STATE_ID = "event-state-id-1";
const SOURCE_EVENT_UID = "source-event-uid-1";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const OUTAGE_PASS_COUNT = 6;

const createTarget = (): WriteBackTarget => ({
  deleteIdentifier: "mirror-1",
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  destinationEventUid: "mirror-1",
  eventStateId: EVENT_STATE_ID,
  mappingId: MAPPING_ID,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  sourceEventId: null,
  sourceEventUid: SOURCE_EVENT_UID,
});

const SOURCE_EVENT: SourceEventSnapshot = {
  description: "",
  endTime: END_TIME,
  isAllDay: false,
  location: "",
  startTime: START_TIME,
  startTimeZone: null,
  title: "Busy",
};

const createOutageHarness = () => {
  const confirmations: { reason: string }[] = [];
  const quarantines: { reason: string }[] = [];
  const state = { abandons: 0, epoch: 0, presence: "absent", sourceEvent: SOURCE_EVENT };

  /*
   * The socket dies mid-flight: retryable and indeterminate, which the applier is meant to
   * spend against the 30-pass failure budget rather than the 5-pass landed budget.
   */
  const writer: CalendarSourceWriter = {
    deleteEvent: () =>
      Promise.resolve({
        error: "fetch failed",
        indeterminate: true,
        retryable: true,
        success: false,
      }),
    updateEvent: () =>
      Promise.resolve({
        error: "fetch failed",
        indeterminate: true,
        retryable: true,
        success: false,
      }),
  };

  const locked: LockedWriteBackStore = {
    commitDelete: () => Promise.resolve(),
    commitUpdate: () => Promise.resolve({ writeBackEpoch: 1 }),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: PUSHED_HASH }),
    readPairWriteBack: () =>
      Promise.resolve({ writeBackMode: "edits_and_deletes", writeBackState: "ok" }),
    readSourceEvent: () => Promise.resolve(state.sourceEvent),
  };

  const store: WriteBackStore = {
    abandonTombstone: () => Promise.resolve(),
    countRecentDeletes: () => Promise.resolve(0),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    probeDestinationEvent: () => {
      if (state.presence === "unreachable") {
        return Promise.reject(new Error("the destination could not be read"));
      }
      return Promise.resolve("absent");
    },
    quarantineMapping: (_source, _destination, reason) => {
      quarantines.push({ reason });
      return Promise.resolve();
    },
    readSourceEvent: () => Promise.resolve(state.sourceEvent),
    /*
     * The two budgets the real store keeps: every failure spends the epoch, and only an
     * abandoned classification spends the abandon count. The answer is the budget the
     * outcome is judged against.
     */
    recordFailure: (_mappingId, outcome) => {
      state.epoch += 1;
      if (outcome === "abandoned") {
        state.abandons += 1;
        return Promise.resolve(state.abandons);
      }
      return Promise.resolve(state.epoch);
    },
    recordTombstone: () =>
      Promise.resolve({ id: "tombstone-1", observedAt: new Date(), priorAttempt: false }),
    requestDeleteConfirmation: (_source, _destination, reason) => {
      confirmations.push({ reason });
      return Promise.resolve();
    },
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => run(locked),
  };

  return { confirmations, quarantines, state, store };
};

const createWriteBack = (): InboundClassification => ({
  expectedSource: {
    description: "",
    endTime: END_TIME,
    isAllDay: false,
    location: "",
    startTime: START_TIME,
    summary: "Busy",
  },
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  observed: {
    availability: "busy",
    contentHash: "observed-content-hash",
    description: "",
    endTime: END_TIME,
    isAllDay: false,
    location: "",
    startTime: START_TIME,
    summary: "Dentist",
  },
  projectedSyncEventHash: "projected-hash",
  sourceEventUid: SOURCE_EVENT_UID,
  type: "write-back",
  updates: { summary: "Dentist" },
});

const createDelete = (): InboundClassification => ({
  expectedSource: {
    description: "",
    endTime: END_TIME,
    isAllDay: false,
    location: "",
    startTime: START_TIME,
    summary: "Busy",
  },
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  sourceEventUid: SOURCE_EVENT_UID,
  type: "delete",
});

const runOutage = async (
  store: WriteBackStore,
  classification: () => InboundClassification,
): Promise<void> => {
  for (let pass = 0; pass < OUTAGE_PASS_COUNT; pass += 1) {
    await runWriteBackPass({
      calendarId: DESTINATION_CALENDAR_ID,
      classifications: [classification()],
      store,
    });
  }
};

describe("a budget spent entirely on rejections is not a runaway", () => {
  it("does not revert the pair to one-way on the first abandon after an outage", async () => {
    const harness = createOutageHarness();

    await runOutage(harness.store, createWriteBack);
    expect(harness.quarantines).toEqual([]);
    expect(harness.state.epoch).toBe(OUTAGE_PASS_COUNT);

    /*
     * The outage clears and the source event has moved in the meantime, so the pass that
     * follows abandons rather than writing. Nothing ran away: not one of the spends above
     * reached a real calendar.
     */
    harness.state.sourceEvent = { ...SOURCE_EVENT, title: "Moved on the phone" };
    await runWriteBackPass({
      calendarId: DESTINATION_CALENDAR_ID,
      classifications: [createWriteBack()],
      store: harness.store,
    });

    expect(harness.quarantines.map(({ reason }) => reason)).toEqual([]);
  });

  it("does not demand a human answer on the first delete probe an outage blocks", async () => {
    const harness = createOutageHarness();

    await runOutage(harness.store, createDelete);
    expect(harness.quarantines).toEqual([]);

    harness.state.presence = "unreachable";
    await runWriteBackPass({
      calendarId: DESTINATION_CALENDAR_ID,
      classifications: [createDelete()],
      store: harness.store,
    });

    expect(harness.confirmations.map(({ reason }) => reason)).toEqual([]);
  });
});
