import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOutlookSourceWriter } from "../../../../src/providers/outlook/source/mutations";

const ACCESS_TOKEN = "outlook-access-token";
const ACCOUNT_EMAIL = "me@example.com";
const SOURCE_EVENT_ID = "AAMkAGI2-shared-event";
const SOURCE_EVENT_UID = "source-event-uid@example.com";
const OK_STATUS = 200;

interface RecordedRequest {
  method: string;
  url: string;
}

describe("an Outlook source write on a calendar somebody else owns", () => {
  let requests: RecordedRequest[] = [];
  let event: Record<string, unknown> = {};
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requests = [];
    globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, url: String(input) });
      if (method === "GET") {
        return Promise.resolve(Response.json(event, { status: OK_STATUS }));
      }
      return Promise.resolve(new Response("{}", { status: OK_STATUS }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not delete an event Graph says this account does not organize", async () => {
    event = { id: SOURCE_EVENT_ID, isOrganizer: false, subject: "Studio booked" };

    const result = await createOutlookSourceWriter({
      accessToken: () => Promise.resolve(ACCESS_TOKEN),
      accountEmail: ACCOUNT_EMAIL,
    }).deleteEvent({ sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID });

    expect(requests.filter(({ method }) => method === "DELETE")).toEqual([]);
    expect(result.refused).toBe("event_authored_by_someone_else");
  });

  it("does not reschedule an event organized by another address", async () => {
    event = {
      id: SOURCE_EVENT_ID,
      organizer: { emailAddress: { address: "colleague@example.com" } },
      subject: "Studio booked",
    };

    const result = await createOutlookSourceWriter({
      accessToken: () => Promise.resolve(ACCESS_TOKEN),
      accountEmail: ACCOUNT_EMAIL,
    }).updateEvent(
      { sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(requests.filter(({ method }) => method === "PATCH")).toEqual([]);
    expect(result.refused).toBe("event_authored_by_someone_else");
  });

  it("still writes the account's own event", async () => {
    event = {
      id: SOURCE_EVENT_ID,
      isOrganizer: true,
      organizer: { emailAddress: { address: "ME@Example.com " } },
      subject: "Studio booked",
    };

    const result = await createOutlookSourceWriter({
      accessToken: () => Promise.resolve(ACCESS_TOKEN),
      accountEmail: ACCOUNT_EMAIL,
    }).deleteEvent({ sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID });

    expect(requests.filter(({ method }) => method === "DELETE")).toHaveLength(1);
    expect(result.success).toBe(true);
  });
});
