import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleSourceWriter } from "../../../../src/providers/google/source/mutations";

const ACCESS_TOKEN = "google-access-token";
const ACCOUNT_EMAIL = "me@example.com";
const COLLEAGUE_EMAIL = "colleague@example.com";
const SOURCE_EVENT_ID = "google-event-id";
const SOURCE_EVENT_UID = "source-event-uid@example.com";
const OK_STATUS = 200;

/*
 * Google's `self` flags compare the entity against the calendar this copy sits on, not
 * against the signed-in account: creator.self is "whether the creator corresponds to the
 * calendar on which this copy of the event appears". On a colleague's primary calendar,
 * shared with write access, the creator IS that calendar, so the colleague's own bookings
 * carry creator.self true while the addresses provably disagree.
 */
const COLLEAGUES_OWN_BOOKING = {
  creator: { email: COLLEAGUE_EMAIL, self: true },
  id: SOURCE_EVENT_ID,
  organizer: { email: COLLEAGUE_EMAIL, self: true },
  summary: "Studio booked",
};

interface RecordedRequest {
  method: string;
  url: string;
}

const createWriter = () => createGoogleSourceWriter({
  accessToken: () => Promise.resolve(ACCESS_TOKEN),
  accountEmail: ACCOUNT_EMAIL,
  externalCalendarId: COLLEAGUE_EMAIL,
});

describe("a Google source write on a colleague's primary calendar", () => {
  let requests: RecordedRequest[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requests = [];
    globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, url: String(input) });
      if (method === "GET") {
        return Promise.resolve(Response.json(COLLEAGUES_OWN_BOOKING, { status: OK_STATUS }));
      }
      return Promise.resolve(new Response("{}", { status: OK_STATUS }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("refuses to delete a booking the colleague made on their own calendar", async () => {
    const result = await createWriter().deleteEvent({
      sourceEventId: SOURCE_EVENT_ID,
      sourceEventUid: SOURCE_EVENT_UID,
    });

    expect(requests.filter(({ method }) => method === "DELETE")).toEqual([]);
    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(result.success).toBe(false);
  });

  it("refuses to rewrite a booking the colleague made on their own calendar", async () => {
    const result = await createWriter().updateEvent(
      { sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(requests.filter(({ method }) => method === "PATCH")).toEqual([]);
    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(result.success).toBe(false);
  });
});
