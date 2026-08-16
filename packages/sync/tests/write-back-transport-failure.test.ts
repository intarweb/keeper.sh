import { afterEach, describe, expect, it, vi } from "vitest";
import { TWO_WAY_EPOCH_QUARANTINE_LIMIT } from "@keeper.sh/calendar";
import { createGoogleSourceWriter } from "@keeper.sh/calendar";
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
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const OK = 200;
const NONE = 0;
const ONE = 1;

const SOURCE_EVENT: SourceEventSnapshot = {
  description: null,
  endTime: END_TIME,
  isAllDay: null,
  location: null,
  startTime: START_TIME,
  startTimeZone: null,
  title: "Dentist",
};

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

const createWriteBack = (): InboundClassification => ({
  expectedSource: { summary: "Dentist" },
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
    summary: "Dentist, moved to Thursday",
  },
  projectedSyncEventHash: "projected-hash",
  sourceEventUid: SOURCE_EVENT_UID,
  type: "write-back",
  updates: { summary: "Dentist, moved to Thursday" },
});

const createDeletion = (): InboundClassification => ({
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  sourceEventUid: SOURCE_EVENT_UID,
  type: "delete",
});

/*
 * The pass drives the real Google source writer over a transport that answers the lookup
 * and then dies on the write itself, because that is the shape the failure has in
 * production: a connection reset, a DNS blip, a read that timed out on this side. No
 * status ever arrives, so nothing downstream can tell it from a permanent defect unless
 * the writer says which one it was.
 */
const createHarness = () => {
  const abandoned: string[] = [];
  const patched: string[] = [];
  const deleted: string[] = [];
  const quarantines: string[] = [];
  const state = { severed: true };
  const epoch = { spent: NONE };
  const pair = { writeBackState: "ok" };

  globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    if (method === "GET") {
      const [, sourceEventUid] = /iCalUID=([^&]+)/.exec(url) ?? [];
      return Promise.resolve(
        Response.json(
          {
            items: [{
              iCalUID: decodeURIComponent(sourceEventUid ?? ""),
              id: decodeURIComponent(sourceEventUid ?? ""),
            }],
          },
          { status: OK },
        ),
      );
    }
    if (state.severed) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    const eventId = decodeURIComponent(url.split("/").pop() ?? "");
    if (method === "DELETE") {
      deleted.push(eventId);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    patched.push(eventId);
    return Promise.resolve(Response.json({ id: SOURCE_EVENT_UID }, { status: OK }));
  }) as unknown as typeof fetch;

  const writer: CalendarSourceWriter = createGoogleSourceWriter({
    accessToken: () => Promise.resolve("token"),
    externalCalendarId: "primary",
  });

  const locked: LockedWriteBackStore = {
    commitDelete: () => Promise.resolve(),
    commitUpdate: () => Promise.resolve({ writeBackDailyCount: ONE, writeBackEpoch: ONE }),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: PUSHED_HASH }),
    readPairWriteBack: () =>
      Promise.resolve({
        writeBackMode: "edits_and_deletes",
        writeBackState: pair.writeBackState,
      }),
    readSourceEvent: () => Promise.resolve(SOURCE_EVENT),
  };

  const store: WriteBackStore = {
    abandonTombstone: (claim) => {
      abandoned.push(claim.tombstoneId);
      return Promise.resolve();
    },
    countRecentDeletes: () => Promise.resolve(NONE),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    probeDestinationEvent: () => Promise.resolve("absent"),
    quarantineMapping: (_source, _destination, reason) => {
      quarantines.push(reason);
      pair.writeBackState = "quarantined";
      return Promise.resolve();
    },
    readSourceEvent: () => Promise.resolve(SOURCE_EVENT),
    recordFailure: () => {
      epoch.spent += ONE;
      return Promise.resolve(epoch.spent);
    },
    recordTombstone: () =>
      Promise.resolve({ id: "tombstone-1", observedAt: new Date(), priorAttempt: false }),
    requestDeleteConfirmation: () => Promise.resolve(),
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => run(locked),
  };

  return { abandoned, deleted, patched, quarantines, state, store };
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const runPass = (
  store: WriteBackStore,
  classification: InboundClassification,
): Promise<unknown> =>
  runWriteBackPass({
    calendarId: DESTINATION_CALENDAR_ID,
    classifications: [classification],
    onError: () => {
      /* The severed connection is the fixture; the assertions read the writer and pair. */
    },
    store,
  });

/*
 * A write whose socket dies is the provider saying nothing at all, which is the same "not
 * right now" a 503 is — the only difference is that it never got to say it. Spending it as
 * a permanent defect reverts the pair to one-way after five passes, rebuilds every edited
 * copy from its original, and retries nothing once the pair is off: minutes of ordinary
 * network flakiness cost the user every edit that had not landed yet.
 */
describe("a source write that never got an answer", () => {
  it("writes the edit back when the connection holds", async () => {
    const harness = createHarness();
    harness.state.severed = false;

    await runPass(harness.store, createWriteBack());

    expect(harness.patched).toEqual([SOURCE_EVENT_UID]);
    expect(harness.quarantines).toEqual([]);
  });

  it("does not turn two-way sync off over a connection that dropped", async () => {
    const harness = createHarness();

    for (let pass = NONE; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += ONE) {
      await runPass(harness.store, createWriteBack());
    }

    expect(harness.patched).toEqual([]);
    expect(harness.quarantines).toEqual([]);
  });

  it("still writes the edit back once the connection recovers", async () => {
    const harness = createHarness();

    for (let pass = NONE; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += ONE) {
      await runPass(harness.store, createWriteBack());
    }
    harness.state.severed = false;
    await runPass(harness.store, createWriteBack());

    expect(harness.patched).toEqual([SOURCE_EVENT_UID]);
  });

  /*
   * A deletion answered by silence may already have destroyed the real event. Releasing
   * its record would leave the user with an event gone from their calendar and nothing
   * under Deleted Events to read it back from.
   */
  it("keeps the record of a deletion that may have landed", async () => {
    const harness = createHarness();

    await runPass(harness.store, createDeletion());

    expect(harness.deleted).toEqual([]);
    expect(harness.abandoned).toEqual([]);
  });
});
