import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleSourceWriter } from "@keeper.sh/calendar";
import type { CalendarSourceWriter, InboundClassification } from "@keeper.sh/calendar";
import { runWriteBackPass } from "../src/write-back-pass";
import type {
  LockedWriteBackStore,
  SourceEventSnapshot,
  WriteBackStore,
  WriteBackTarget,
} from "../src/write-back-pass";

const SOURCE_CALENDAR_ID = "team-calendar@group.calendar.google.com";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const MAPPING_ID = "mapping-id-1";
const EVENT_STATE_ID = "event-state-id-1";
const SOURCE_EVENT_UID = "source-event-uid-1";
const ACCOUNT_EMAIL = "me@example.com";
const COLLEAGUE_EMAIL = "colleague@example.com";
const PUSHED_HASH = "the-hash-of-what-we-last-pushed";
const START_TIME = new Date("2027-05-11T14:00:00.000Z");
const END_TIME = new Date("2027-05-11T15:00:00.000Z");
const OK = 200;
const NONE = 0;
const ONCE = 1;

const SOURCE_EVENT: SourceEventSnapshot = {
  description: null,
  endTime: END_TIME,
  isAllDay: null,
  location: null,
  startTime: START_TIME,
  startTimeZone: null,
  title: "Studio booked",
};

const EXPECTED_SOURCE = {
  description: "",
  endTime: END_TIME,
  isAllDay: false,
  location: "",
  startTime: START_TIME,
  summary: "Studio booked",
};

const createTarget = (): WriteBackTarget => ({
  deleteIdentifier: "mirror-1",
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  destinationEventUid: "mirror-1",
  eventStateId: EVENT_STATE_ID,
  mappingId: MAPPING_ID,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  sourceEventId: SOURCE_EVENT_UID,
  sourceEventUid: SOURCE_EVENT_UID,
});

const createDeletion = (): InboundClassification => ({
  expectedSource: EXPECTED_SOURCE,
  expectedSyncEventHash: PUSHED_HASH,
  mappingId: MAPPING_ID,
  sourceEventUid: SOURCE_EVENT_UID,
  type: "delete",
});

const createWriteBack = (): InboundClassification => ({
  expectedSource: EXPECTED_SOURCE,
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
    summary: "Renamed on the destination",
  },
  projectedSyncEventHash: "projected-hash",
  sourceEventUid: SOURCE_EVENT_UID,
  type: "write-back",
  updates: { summary: "Renamed on the destination" },
});

/*
 * A team calendar a colleague shared with "Make changes to events". Google grants the
 * write, so the two-way controls are offered on it; the event on it is the colleague's,
 * with nobody invited, so nothing about its guest list stops a mirror from destroying it.
 */
const COLLEAGUES_EVENT = {
  creator: { email: COLLEAGUE_EMAIL, self: false },
  iCalUID: SOURCE_EVENT_UID,
  id: SOURCE_EVENT_UID,
  organizer: { email: SOURCE_CALENDAR_ID, self: false },
  summary: "Studio booked",
};

const createHarness = () => {
  const writes: string[] = [];
  const quarantines: string[] = [];
  const pair = { writeBackState: "ok" };

  globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve(Response.json(COLLEAGUES_EVENT, { status: OK }));
    }
    writes.push(method);
    return Promise.resolve(new Response("{}", { status: OK }));
  }) as unknown as typeof fetch;

  const writer: CalendarSourceWriter = createGoogleSourceWriter({
    accessToken: () => Promise.resolve("token"),
    accountEmail: ACCOUNT_EMAIL,
    externalCalendarId: SOURCE_CALENDAR_ID,
  });

  const locked: LockedWriteBackStore = {
    commitDelete: () => Promise.resolve(),
    commitUpdate: () => Promise.resolve({ writeBackDailyCount: ONCE, writeBackAppliedCount: ONCE }),
    readMappingSyncEventHash: () => Promise.resolve({ syncEventHash: PUSHED_HASH }),
    readPairWriteBack: () =>
      Promise.resolve({
        writeBackMode: "edits_and_deletes",
        writeBackState: pair.writeBackState,
      }),
    readSourceEvent: () => Promise.resolve(SOURCE_EVENT),
  };

  const store: WriteBackStore = {
    abandonTombstone: () => Promise.resolve(),
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
    recordFailure: () => Promise.resolve(ONCE),
    recordTombstone: () =>
      Promise.resolve({ id: "tombstone-1", observedAt: new Date(), priorAttempt: false }),
    requestDeleteConfirmation: () => Promise.resolve(),
    resolveWriter: () => Promise.resolve(writer),
    withSourceLock: (_sourceCalendarId, run) => run(locked),
  };

  return { quarantines, store, writes };
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
    store,
  });

/*
 * The product page states, under the two things never touched whatever the mode, that an
 * event created by somebody else on a calendar shared with you is one of them — and that
 * is the sentence a user reads before pointing "Two-way, including deletions" at a team
 * calendar. Deleting a copy of a colleague's booking would then destroy their real event:
 * no undo, no rebuild, and they are not the person who asked for any of it.
 */
describe("a source event on a calendar a colleague shared", () => {
  it("is not deleted when its copy disappears, and the pair is paused with a reason", async () => {
    const harness = createHarness();

    await runPass(harness.store, createDeletion());

    expect(harness.writes).toEqual([]);
    expect(harness.quarantines).toEqual(["source_event_authored_by_someone_else"]);
  });

  it("is not rewritten when its copy is edited, and the pair is paused with a reason", async () => {
    const harness = createHarness();

    await runPass(harness.store, createWriteBack());

    expect(harness.writes).toEqual([]);
    expect(harness.quarantines).toEqual(["source_event_authored_by_someone_else"]);
  });
});
