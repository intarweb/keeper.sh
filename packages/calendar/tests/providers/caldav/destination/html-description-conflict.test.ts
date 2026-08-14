import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateDeterministicEventUid } from "../../../../src/core/events/identity";
import type { MaterializedSyncableEvent } from "../../../../src/core/types";
import { createCalDAVSyncProvider } from "../../../../src/providers/caldav/destination/provider";
import { CalDAVCreateConflictError } from "../../../../src/providers/caldav/shared/client";
import { eventToICalString } from "../../../../src/providers/caldav/shared/ics";

const clientMocks = vi.hoisted(() => ({
  createCalendarObject: vi.fn(),
  deleteCalendarObject: vi.fn(),
  deleteCalendarObjectByUrl: vi.fn(),
  fetchCalendarObject: vi.fn(),
  fetchCalendarObjects: vi.fn(),
  resolveCalendarUrl: vi.fn(),
}));

vi.mock("../../../../src/providers/caldav/shared/client", () => {
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

const HTML_DESCRIPTION = "<p>Agenda</p><p>Join "
  + "<a href=\"https://tel.meet/xxx?pin=1&amp;hs=2\">https://tel.meet/xxx?pin=1&amp;hs=2</a></p>";

const createEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description: HTML_DESCRIPTION,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
  ...overrides,
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

describe("CalDAV create conflict recovery for HTML descriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("accepts a plaintext read-back of the HTML description it wrote", async () => {
    const event = createEvent();
    mockConflictWith(event);

    const results = await createProvider().pushEvents([event]);

    expect(results).toEqual([expect.objectContaining({ conflictResolved: true, success: true })]);
    expect(clientMocks.deleteCalendarObject).not.toHaveBeenCalled();
    expect(clientMocks.createCalendarObject).toHaveBeenCalledTimes(1);
  });

  it("still recreates when the existing object differs in start time", async () => {
    mockConflictWith(createEvent());
    const moved = createEvent({
      endTime: new Date("2026-03-08T18:00:00.000Z"),
      startTime: new Date("2026-03-08T17:00:00.000Z"),
    });

    await createProvider().pushEvents([moved]);

    expect(clientMocks.deleteCalendarObject).toHaveBeenCalledTimes(1);
    expect(clientMocks.createCalendarObject).toHaveBeenCalledTimes(2);
  });

  it("still recreates when the existing object differs in timezone", async () => {
    mockConflictWith(createEvent({ startTimeZone: "America/Toronto" }));
    const retimed = createEvent({ startTimeZone: "Europe/Berlin" });

    await createProvider().pushEvents([retimed]);

    expect(clientMocks.deleteCalendarObject).toHaveBeenCalledTimes(1);
    expect(clientMocks.createCalendarObject).toHaveBeenCalledTimes(2);
  });

  it("still recreates when the existing object differs in availability", async () => {
    mockConflictWith(createEvent({ availability: "free" }));
    const busy = createEvent({ availability: "busy" });

    await createProvider().pushEvents([busy]);

    expect(clientMocks.deleteCalendarObject).toHaveBeenCalledTimes(1);
    expect(clientMocks.createCalendarObject).toHaveBeenCalledTimes(2);
  });
});
