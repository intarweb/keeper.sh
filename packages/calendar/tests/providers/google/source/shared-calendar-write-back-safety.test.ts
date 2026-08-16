import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleSourceWriter } from "../../../../src/providers/google/source/mutations";

const ACCESS_TOKEN = "google-access-token";
const SOURCE_EVENT_ID = "google-event-id";
const SOURCE_EVENT_UID = "source-event-uid@example.com";
const SHARED_CALENDAR_ID = "team-calendar@group.calendar.google.com";
const OK_STATUS = 200;

/*
 * A calendar a colleague shared with write access is an ordinary two-way source. This
 * event is one the colleague created on it: no attendees, so nobody is notified, and
 * nobody but its author can put it back.
 */
const SOMEONE_ELSES_EVENT = {
  creator: { email: "colleague@example.com" },
  id: SOURCE_EVENT_ID,
  organizer: { email: "colleague@example.com", self: false },
  summary: "Studio booked",
};

interface RecordedRequest {
  method: string;
  url: string;
}

const createWriter = () => createGoogleSourceWriter({
  accessToken: () => Promise.resolve(ACCESS_TOKEN),
  externalCalendarId: SHARED_CALENDAR_ID,
});

describe("a Google source write on a shared calendar", () => {
  let requests: RecordedRequest[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requests = [];
    globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, url: String(input) });
      if (method === "GET") {
        return Promise.resolve(Response.json(SOMEONE_ELSES_EVENT, { status: OK_STATUS }));
      }
      return Promise.resolve(new Response("{}", { status: OK_STATUS }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not delete an event the user did not create", async () => {
    const result = await createWriter().deleteEvent({
      sourceEventId: SOURCE_EVENT_ID,
      sourceEventUid: SOURCE_EVENT_UID,
    });

    expect(requests.filter(({ method }) => method === "DELETE")).toEqual([]);
    expect(result.success).toBe(false);
  });
});
