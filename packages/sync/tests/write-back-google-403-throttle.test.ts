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
const FORBIDDEN = 403;
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

/*
 * Google Calendar answers its per-user write quota with 403 and a reason, not with 429.
 * The shape below is the one packages/calendar/src/providers/google/shared/errors.ts
 * already recognises as a rate limit on the read path (isRateLimitApiError).
 */
const THROTTLED_BODY = JSON.stringify({
  error: {
    code: FORBIDDEN,
    errors: [{
      domain: "usageLimits",
      message: "Rate Limit Exceeded",
      reason: "userRateLimitExceeded",
    }],
    message: "Rate Limit Exceeded",
  },
});

const createHarness = () => {
  const patched: string[] = [];
  const quarantines: string[] = [];
  const state = { throttling: true };
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
    if (state.throttling) {
      return Promise.resolve(
        new Response(THROTTLED_BODY, {
          headers: { "content-type": "application/json" },
          status: FORBIDDEN,
        }),
      );
    }
    patched.push(decodeURIComponent(url.split("/").pop() ?? ""));
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
    abandonTombstone: () => Promise.resolve(),
    countRecentDeletes: () => Promise.resolve(NONE),
    loadTarget: () => Promise.resolve(createTarget()),
    notifySiblings: () => Promise.resolve(),
    probeDestinationEvent: () => Promise.resolve("present"),
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

  return { patched, quarantines, state, store };
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const runPass = (store: WriteBackStore): Promise<unknown> =>
  runWriteBackPass({
    calendarId: DESTINATION_CALENDAR_ID,
    classifications: [createWriteBack()],
    onError: () => {
      /* The rejections are the fixture; the assertions read the writer and the pair. */
    },
    store,
  });

describe("Google answers a write quota with 403, not 429", () => {
  it("does not turn two-way sync off for a quota that clears in minutes", async () => {
    const harness = createHarness();

    for (let pass = NONE; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += ONE) {
      await runPass(harness.store);
    }

    expect(harness.patched).toEqual([]);
    expect(harness.quarantines).toEqual([]);
  });

  it("still writes the edit back once the quota window rolls over", async () => {
    const harness = createHarness();

    for (let pass = NONE; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += ONE) {
      await runPass(harness.store);
    }
    harness.state.throttling = false;
    await runPass(harness.store);

    expect(harness.patched).toEqual([SOURCE_EVENT_UID]);
  });
});
