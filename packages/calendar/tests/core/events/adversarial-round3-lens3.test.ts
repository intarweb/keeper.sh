import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
import type { EventMapping } from "../../../src/core/events/mappings";
import type { MaterializedSyncableEvent, RemoteEvent } from "../../../src/core/types";
import { canonicalizeComparableText } from "../../../src/core/events/html-text";
import { generateDeterministicEventUid } from "../../../src/core/events/identity";
import { createCalDAVSyncProvider } from "../../../src/providers/caldav/destination/provider";
import { CalDAVCreateConflictError } from "../../../src/providers/caldav/shared/client";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../src/providers/caldav/shared/ics";

const clientMocks = vi.hoisted(() => ({
  createCalendarObject: vi.fn(),
  deleteCalendarObject: vi.fn(),
  deleteCalendarObjectByUrl: vi.fn(),
  fetchCalendarObject: vi.fn(),
  fetchCalendarObjects: vi.fn(),
  resolveCalendarUrl: vi.fn(),
}));

vi.mock("../../../src/providers/caldav/shared/client", () => {
  class MockCalDAVHttpError extends Error {
    status: number;

    constructor(response: Response) {
      super(`CalDAV request failed: ${response.status}`);
      this.name = "CalDAVHttpError";
      this.status = response.status;
    }
  }

  class MockCalDAVCreateConflictError extends MockCalDAVHttpError {
    constructor(response: Response) {
      super(response);
      this.name = "CalDAVCreateConflictError";
    }
  }

  class CalDAVClient {
    createCalendarObject = clientMocks.createCalendarObject;
    deleteCalendarObject = clientMocks.deleteCalendarObject;
    deleteCalendarObjectByUrl = clientMocks.deleteCalendarObjectByUrl;
    fetchCalendarObject = clientMocks.fetchCalendarObject;
    fetchCalendarObjects = clientMocks.fetchCalendarObjects;
    resolveCalendarUrl = clientMocks.resolveCalendarUrl;
  }

  return {
    CalDAVClient,
    CalDAVCreateConflictError: MockCalDAVCreateConflictError,
    CalDAVHttpError: MockCalDAVHttpError,
  };
});

const escapeOnce = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeTimes = (value: string, times: number): string => {
  if (times === 0) {
    return value;
  }

  return escapeTimes(escapeOnce(value), times - 1);
};

const SCOPE: ReconciliationScope = {
  authoritativeWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
  requestedWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
};

const createLocalEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description: "",
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
  ...overrides,
});

const createMapping = (event: MaterializedSyncableEvent): EventMapping => ({
  calendarId: "destination-calendar-id",
  deleteIdentifier: "delete-identifier-1",
  destinationEventUid: "destination-uid-1",
  endTime: event.endTime,
  eventStateId: event.id,
  id: "mapping-id-1",
  sourceCalendarId: "source-calendar-id",
  startTime: event.startTime,
  syncEventHash: createSyncEventContentHash(event),
  syncEventId: event.id,
});

const createRemoteEvent = (
  event: MaterializedSyncableEvent,
  mapping: EventMapping,
  remote: Partial<MaterializedSyncableEvent>,
): RemoteEvent => {
  const content = createEditableEventContentSnapshot({ ...event, ...remote });
  return {
    deleteId: mapping.deleteIdentifier,
    editableAvailability: "busy",
    editableContent: content,
    editableContentHash: hashEditableEventContentSnapshot(content),
    endTime: event.endTime,
    isKeeperEvent: true,
    startTime: event.startTime,
    supportedAvailabilities: ["busy", "free"],
    uid: mapping.destinationEventUid,
  };
};

const reconcile = (
  local: Partial<MaterializedSyncableEvent>,
  remote: Partial<MaterializedSyncableEvent>,
) => {
  const event = createLocalEvent(local);
  const mapping = createMapping(event);
  return computeSyncOperations(
    [event],
    [mapping],
    [createRemoteEvent(event, mapping, remote)],
    SCOPE,
  );
};

describe("R3L3-A: a raw-text element name in prose hides everything after it", () => {
  it("still replaces the mirror when the destination rewrites the text after <style>", () => {
    const result = reconcile(
      { description: "<div>Use the &lt;style&gt; attribute<br>Ship by Friday</div>" },
      { description: "Use the <style> attribute\nEVENT CANCELLED, do not attend" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when the join link after <script> is stripped", () => {
    const local = "<html><body><p>Notes &lt;script&gt; review</p>"
      + "<p>Join <a href=\"https://zoom.us/j/123\">Zoom</a></p></body></html>";
    const result = reconcile(
      { description: local },
      { description: "Notes <script> review" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when the summary after <script> is renamed", () => {
    const result = reconcile(
      { summary: "The <script> review with Sam" },
      { summary: "The <script> review — MOVED to Friday 9am" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("keeps a non-empty description distinguishable from an empty one", () => {
    expect(canonicalizeComparableText("&lt;style&gt;<br>Room 4, bring the deck"))
      .not.toBe(canonicalizeComparableText(""));
  });
});

describe("R3L3-B: angle-bracketed placeholders in summary and location", () => {
  it("still replaces the mirror when a bracketed token is dropped from the location", () => {
    const result = reconcile(
      { location: "Room <B>, second floor" },
      { location: "Room , second floor" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when a bracketed token is dropped from the summary", () => {
    const result = reconcile(
      { summary: "Interview: <NAME> at <TIME>" },
      { summary: "Interview: <NAME> at" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });
});

describe("R3L3-C: canonicalizeComparableText is still not idempotent", () => {
  it("is idempotent however many times a destination re-escaped the value", () => {
    const once = canonicalizeComparableText(escapeTimes("<p>hello &amp; world</p>", 17));

    expect(canonicalizeComparableText(once)).toBe(once);
  });

  it("compares a value equal to its own re-escaped echo at any depth", () => {
    const source = "<p>Team &amp; Co</p>";

    expect(canonicalizeComparableText(escapeTimes(source, 17)))
      .toBe(canonicalizeComparableText(source));
  });
});

describe("R3L3-D: CalDAV mirror this branch writes and reads back", () => {
  const roundTrip = (description: string): string =>
    parseICalToRemoteEvent(
      eventToICalString(createLocalEvent({ description }), "uid-1@keeper.sh"),
    )?.description ?? "";

  it("compares a mirror equal to the description it was written from", () => {
    const description = "&lt&ltb&gtd&lt/b&gt<style></style>\n<i>";

    expect(canonicalizeComparableText(roundTrip(description)))
      .toBe(canonicalizeComparableText(description));
  });
});

describe("R3L3-E: CalDAV create-conflict recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const createProvider = () =>
    createCalDAVSyncProvider({
      calendarUrl: "https://caldav.example.com/calendar/",
      password: "pass",
      serverUrl: "https://caldav.example.com",
      username: "user",
    });

  const mockConflictWith = (existing: MaterializedSyncableEvent) => {
    clientMocks.createCalendarObject
      .mockRejectedValueOnce(new CalDAVCreateConflictError(new Response(null, { status: 412 })))
      .mockImplementationOnce(() => Promise.resolve());
    clientMocks.fetchCalendarObject.mockResolvedValueOnce({
      data: eventToICalString(existing, generateDeterministicEventUid(existing.id)),
      etag: "etag-1",
      url: "https://caldav.example.com/calendar/existing-uid.ics",
    });
    clientMocks.deleteCalendarObject.mockImplementationOnce(() => Promise.resolve());
  };

  it("recreates when the existing object says something different after <style>", async () => {
    mockConflictWith(createLocalEvent({
      description: "Use the <style> attribute\nEVENT CANCELLED, do not attend",
    }));
    const event = createLocalEvent({
      description: "<div>Use the &lt;style&gt; attribute<br>Ship by Friday</div>",
    });

    await createProvider().pushEvents([event]);

    expect(clientMocks.deleteCalendarObject).toHaveBeenCalledTimes(1);
    expect(clientMocks.createCalendarObject).toHaveBeenCalledTimes(2);
  });
});
