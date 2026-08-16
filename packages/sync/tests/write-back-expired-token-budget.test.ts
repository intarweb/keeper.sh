import { afterEach, describe, expect, it, vi } from "vitest";
import { TWO_WAY_EPOCH_QUARANTINE_LIMIT } from "@keeper.sh/calendar";
import { createGoogleSourceWriter, createOutlookSourceWriter } from "@keeper.sh/calendar";
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
const UNAUTHORIZED = 401;
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
 * What Google answers a Bearer token it no longer accepts. The stored expiry is still in
 * the future, so the coordinated refresher hands the cached token straight back and never
 * asks for a new one — the case a password change, a revoke-and-regrant or a rotation by a
 * concurrent refresh puts the credential in.
 */
const GOOGLE_UNAUTHENTICATED_BODY = JSON.stringify({
  error: {
    code: UNAUTHORIZED,
    message: "Invalid Credentials",
    status: "UNAUTHENTICATED",
  },
});

const GRAPH_UNAUTHENTICATED_BODY = JSON.stringify({
  error: { code: "InvalidAuthenticationToken", message: "Access token has expired." },
});

interface Harness {
  patched: string[];
  quarantines: string[];
  state: { rejecting: boolean };
  store: WriteBackStore;
}

const createHarness = (provider: "google" | "outlook"): Harness => {
  const patched: string[] = [];
  const quarantines: string[] = [];
  const state = { rejecting: true };
  const epoch = { spent: NONE };
  const pair = { writeBackState: "ok" };
  const bodies = new Map([
    ["google", GOOGLE_UNAUTHENTICATED_BODY],
    ["outlook", GRAPH_UNAUTHENTICATED_BODY],
  ]);
  const body = bodies.get(provider) ?? GOOGLE_UNAUTHENTICATED_BODY;

  globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    if (method === "GET") {
      const [, googleUid] = /iCalUID=([^&]+)/.exec(url) ?? [];
      const [, graphUid] = /iCalUId\+eq\+%27(.+?)%27/.exec(url) ?? [];
      const uid = decodeURIComponent(googleUid ?? graphUid ?? "");
      if (provider === "google") {
        return Promise.resolve(
          Response.json({ items: [{ iCalUID: uid, id: uid }] }, { status: OK }),
        );
      }
      return Promise.resolve(Response.json({ value: [{ id: uid }] }, { status: OK }));
    }
    if (state.rejecting) {
      return Promise.resolve(
        new Response(body, {
          headers: { "content-type": "application/json" },
          status: UNAUTHORIZED,
        }),
      );
    }
    patched.push(decodeURIComponent(url.split("/").pop() ?? ""));
    return Promise.resolve(Response.json({ id: SOURCE_EVENT_UID }, { status: OK }));
  }) as unknown as typeof fetch;

  const writers = new Map<string, CalendarSourceWriter>([
    ["google", createGoogleSourceWriter({
      accessToken: () => Promise.resolve("stale-token"),
      externalCalendarId: "primary",
    })],
    ["outlook", createOutlookSourceWriter({
      accessToken: () => Promise.resolve("stale-token"),
    })],
  ]);
  const writer = writers.get(provider);
  if (!writer) {
    throw new Error(`No source writer fixture for ${provider}`);
  }

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

/*
 * A credential the provider stopped accepting is the one write failure a retry actually
 * fixes: the next pass reads the credential row again, the refresher hands over a new
 * token, and the edit lands. Spending it on the five-strike permanent budget reverts the
 * pair to one-way inside five minutes and throws the user's edit away with it — and unlike
 * the lapsed plan, nothing turns it back on when the account is reconnected.
 *
 * Only the two OAuth providers. A CalDAV 401 is a password the user stored that the server
 * rejected: no refresh exists to fix it and asking again cannot change the answer, so it
 * keeps the short budget — pinned by
 * packages/calendar/tests/providers/caldav/source/client-bootstrap-failure.test.ts.
 */
describe.each(["google", "outlook"] as const)(
  "a source token the provider no longer accepts (%s)",
  (provider) => {
    it("does not turn two-way sync off while the credential is being renewed", async () => {
      const harness = createHarness(provider);

      for (let pass = NONE; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += ONE) {
        await runPass(harness.store);
      }

      expect(harness.quarantines).toEqual([]);
    });

    it("writes the edit back once the credential is renewed", async () => {
      const harness = createHarness(provider);

      for (let pass = NONE; pass < TWO_WAY_EPOCH_QUARANTINE_LIMIT; pass += ONE) {
        await runPass(harness.store);
      }
      harness.state.rejecting = false;
      await runPass(harness.store);

      expect(harness.patched).toEqual([SOURCE_EVENT_UID]);
    });
  },
);
