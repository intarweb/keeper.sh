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

const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const MAPPING_ID = "mapping-id-1";
const EVENT_STATE_ID = "event-state-id-1";
const SOURCE_EVENT_UID = "source-event-uid-1";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const HASH_AFTER_THE_SOURCE_MOVED = "the-hash-of-an-event-that-has-since-changed";

const createSourceEvent = (): SourceEventSnapshot => ({
  description: "Bring the notes",
  endTime: END_TIME,
  isAllDay: null,
  location: "Room 4",
  startTime: START_TIME,
  startTimeZone: "America/Toronto",
  title: "Quarterly review",
});

const createTarget = (): WriteBackTarget => ({
  deleteIdentifier: "destination-delete-id-1",
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  destinationEventUid: "destination-uid-1",
  eventStateId: EVENT_STATE_ID,
  mappingId: MAPPING_ID,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  sourceEventId: null,
  sourceEventUid: SOURCE_EVENT_UID,
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
  /* What the targeted read of the copy answers, or a read that could not be made. */
  presence: "absent" | "present" | "unreachable";
  /* The hash the mapping carries when the lock is taken. */
  storedHash: string | null;
  /* Whether the source event is still on record locally. */
  sourceEventOnRecord: boolean;
}

const createHarness = (options: HarnessOptions) => {
  const blocked: string[] = [];
  const confirmations: string[] = [];
  const quarantines: string[] = [];
  const writerCalls: string[] = [];
  let abandons = 0;

  const writer: CalendarSourceWriter = {
    deleteEvent: () => {
      writerCalls.push("delete");
      return Promise.resolve({ success: true });
    },
    updateEvent: () => {
      writerCalls.push("update");
      return Promise.resolve({ success: true });
    },
  };

  const readSourceEvent = (): SourceEventSnapshot | null => {
    if (options.sourceEventOnRecord) {
      return createSourceEvent();
    }
    return null;
  };
  const sourceEvent = readSourceEvent();

  const locked: LockedWriteBackStore = {
    commitDelete: () => Promise.resolve(),
    commitUpdate: () => Promise.resolve({ writeBackAppliedCount: 1 }),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: options.storedHash }),
    readPairWriteBack: () =>
      Promise.resolve({ writeBackMode: "edits_and_deletes", writeBackState: "ok" }),
    readSourceEvent: () => Promise.resolve(sourceEvent),
  };

  const store: WriteBackStore = {
    abandonTombstone: () => Promise.resolve(),
    countRecentDeletes: () => Promise.resolve(0),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    probeDestinationEvent: () => {
      if (options.presence === "unreachable") {
        return Promise.reject(new Error("The destination provider answered 503"));
      }
      return Promise.resolve(options.presence);
    },
    quarantineMapping: (_source, _destination, reason) => {
      quarantines.push(reason);
      return Promise.resolve();
    },
    readSourceEvent: () => Promise.resolve(sourceEvent),
    recordFailure: (_mappingId, outcome) => {
      if (outcome === "abandoned") {
        abandons += 1;
        return Promise.resolve(abandons);
      }
      return Promise.resolve(1);
    },
    recordTombstone: () =>
      Promise.resolve({ id: "tombstone-1", observedAt: new Date(), priorAttempt: false }),
    requestDeleteConfirmation: (_source, _destination, reason) => {
      confirmations.push(reason);
      return Promise.resolve();
    },
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => run(locked),
  };

  return { blocked, confirmations, quarantines, store, writerCalls };
};

const runUntilEscalation = async (harness: ReturnType<typeof createHarness>) => {
  for (let pass = 0; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += 1) {
    await runWriteBackPass({
      calendarId: DESTINATION_CALENDAR_ID,
      classifications: [createDelete()],
      onDeleteBlocked: ({ reason }) => {
        harness.blocked.push(reason);
      },
      store: harness.store,
    });
  }
};

/*
 * The pause a blocked deletion installs is the only account the user is given of it, and
 * "delete_probe_blocked" is rendered as "Keeper.sh can still see the copies on the
 * destination" — with the deletion approval withheld on that footing. It must therefore
 * only be reached when the copy really was seen.
 */
describe("two-way sync: the reason a held deletion states is the reason it was held", () => {
  it("says the copies are still there when the probe really found them", async () => {
    const harness = createHarness({
      presence: "present",
      sourceEventOnRecord: true,
      storedHash: PUSHED_HASH,
    });

    await runUntilEscalation(harness);

    expect(harness.blocked).toContain("still_present");
    expect(harness.confirmations).toEqual(["delete_probe_blocked"]);
    expect(harness.writerCalls).toEqual([]);
  });

  it("does not claim the copies are still there when it could not look at all", async () => {
    const harness = createHarness({
      presence: "unreachable",
      sourceEventOnRecord: true,
      storedHash: PUSHED_HASH,
    });

    await runUntilEscalation(harness);

    /* The pass knows the difference: it reported "could not look", never "still there". */
    expect(harness.blocked).toEqual(
      Array.from({ length: TWO_WAY_EPOCH_QUARANTINE_LIMIT }, () => "probe_unreachable"),
    );
    expect(harness.writerCalls).toEqual([]);
    expect(harness.confirmations).not.toContain("delete_probe_blocked");
  });

  it("does not claim the copies are still there when the source moved under the deletion", async () => {
    const harness = createHarness({
      presence: "absent",
      sourceEventOnRecord: true,
      storedHash: HASH_AFTER_THE_SOURCE_MOVED,
    });

    await runUntilEscalation(harness);

    /* The copy was confirmed gone on every pass; nothing was ever seen on the destination. */
    expect(harness.blocked).toEqual([]);
    expect(harness.writerCalls).toEqual([]);
    expect(harness.confirmations).not.toContain("delete_probe_blocked");
  });

  it("does not claim the copies are still there when the original is no longer on record", async () => {
    const harness = createHarness({
      presence: "absent",
      sourceEventOnRecord: false,
      storedHash: PUSHED_HASH,
    });

    await runUntilEscalation(harness);

    expect(harness.blocked).toEqual([]);
    expect(harness.writerCalls).toEqual([]);
    expect(harness.confirmations).not.toContain("delete_probe_blocked");
  });
});
