import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOutlookSourceWriter } from "../../../../src/providers/outlook/source/mutations";
import { resolveAuthorship } from "../../../../src/core/source/writer";

const ACCESS_TOKEN = "outlook-access-token";
const ACCOUNT_EMAIL = "me@example.com";
const COLLEAGUE_EMAIL = "colleague@example.com";
const SOURCE_EVENT_ID = "AAMkAGI2-shared-event";
const SOURCE_EVENT_UID = "source-event-uid@example.com";
const OK_STATUS = 200;

interface RecordedRequest {
  method: string;
  url: string;
}

const createWriter = () => createOutlookSourceWriter({
  accessToken: () => Promise.resolve(ACCESS_TOKEN),
  accountEmail: ACCOUNT_EMAIL,
});

/*
 * Graph defines isOrganizer against the calendar's owner, not against the signed-in
 * account: "true if the calendar owner is the organizer of the event". On a calendar a
 * colleague shared with write access the owner is the colleague, so their own bookings
 * carry isOrganizer true while the organizer address provably disagrees with the account.
 */
const COLLEAGUES_EVENT_ON_THEIR_SHARED_CALENDAR = {
  id: SOURCE_EVENT_ID,
  isOrganizer: true,
  organizer: { emailAddress: { address: COLLEAGUE_EMAIL } },
  subject: "Studio booked",
};

describe("an Outlook source write on a calendar whose owner is somebody else", () => {
  let requests: RecordedRequest[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requests = [];
    globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, url: String(input) });
      if (method === "GET") {
        return Promise.resolve(
          Response.json(COLLEAGUES_EVENT_ON_THEIR_SHARED_CALENDAR, { status: OK_STATUS }),
        );
      }
      return Promise.resolve(new Response("{}", { status: OK_STATUS }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not read a flag that contradicts the organizer address as the account", () => {
    expect(resolveAuthorship({
      account: ACCOUNT_EMAIL,
      author: COLLEAGUE_EMAIL,
      isAccount: true,
    })).not.toBe("the_account");
  });

  it("still reads the flag as the account where no address can contradict it", () => {
    expect(resolveAuthorship({
      account: null,
      author: COLLEAGUE_EMAIL,
      isAccount: true,
    })).toBe("the_account");
  });

  it("refuses to delete a colleague's booking on the calendar they own", async () => {
    const result = await createWriter().deleteEvent({
      sourceEventId: SOURCE_EVENT_ID,
      sourceEventUid: SOURCE_EVENT_UID,
    });

    expect(requests.filter(({ method }) => method === "DELETE")).toEqual([]);
    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(result.success).toBe(false);
  });

  it("refuses to rewrite a colleague's booking on the calendar they own", async () => {
    const result = await createWriter().updateEvent(
      { sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(requests.filter(({ method }) => method === "PATCH")).toEqual([]);
    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(result.success).toBe(false);
  });
});
