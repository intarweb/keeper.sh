import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleSourceWriter } from "../../../../src/providers/google/source/mutations";

const ACCESS_TOKEN = "google-access-token";
const ACCOUNT_EMAIL = "me@example.com";
const SOURCE_EVENT_ID = "google-event-id";
const SOURCE_EVENT_UID = "source-event-uid@example.com";
const OWN_CALENDAR_ID = "me@example.com";
const OK_STATUS = 200;

/*
 * A focus block a scheduling app wrote onto the user's OWN primary calendar. Nobody is
 * invited, the organizer is the user, the event is theirs to edit in every client they
 * own -- the only thing that is not the user is the service account that created it.
 */
const APP_CREATED_EVENT = {
  creator: { email: "scheduler@reclaim-service.iam.gserviceaccount.com" },
  id: SOURCE_EVENT_ID,
  organizer: { email: ACCOUNT_EMAIL, self: true },
  summary: "Focus block",
};

/*
 * The same shape on a colleague's calendar the user was given write access to. The
 * colleague both created it and holds it, so nothing about it is the user's to change.
 */
const COLLEAGUE_EVENT = {
  creator: { email: "colleague@example.com" },
  id: SOURCE_EVENT_ID,
  organizer: { email: "colleague@example.com", self: true },
  summary: "Colleague's booking",
};

interface RecordedRequest {
  method: string;
  url: string;
}

const createWriter = () => createGoogleSourceWriter({
  accessToken: () => Promise.resolve(ACCESS_TOKEN),
  accountEmail: ACCOUNT_EMAIL,
  externalCalendarId: OWN_CALENDAR_ID,
});

describe("an app-created event on the user's own calendar", () => {
  let requests: RecordedRequest[] = [];
  const served = { event: APP_CREATED_EVENT };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requests = [];
    served.event = APP_CREATED_EVENT;
    globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, url: String(input) });
      if (method === "GET") {
        return Promise.resolve(Response.json(served.event, { status: OK_STATUS }));
      }
      return Promise.resolve(new Response("{}", { status: OK_STATUS }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("is still the user's own event to edit", async () => {
    const result = await createWriter().updateEvent(
      { sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Deep work" },
    );

    expect(result.refused).toBeUndefined();
    expect(result.success).toBe(true);
    expect(requests.filter(({ method }) => method === "PATCH")).toHaveLength(1);
  });

  it("still refuses an event a colleague holds on a calendar they shared", async () => {
    served.event = COLLEAGUE_EVENT;

    const result = await createWriter().updateEvent(
      { sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Deep work" },
    );

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(requests.filter(({ method }) => method === "PATCH")).toEqual([]);
  });
});
