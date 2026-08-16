import { describe, expect, it } from "vitest";
import { createCalDAVSourceWriter } from "../../../../src/providers/caldav/source/mutations";

const CALENDAR_URL = "https://caldav.example.com/calendars/personal";
const SOURCE_EVENT_UID = "source-event-uid-1";

/*
 * Tsdav's createDAVClient performs service discovery, principal and calendar-home round trips
 * before it hands back a client, so an unreachable server or a stale password rejects the
 * thunk the writer opens with — before anything on the calendar has been touched.
 */
const createWriter = (failure: Error) =>
  createCalDAVSourceWriter({
    calendarUrl: CALENDAR_URL,
    client: () => Promise.reject(failure),
  });

describe("a CalDAV writer that cannot reach the server answers instead of throwing", () => {
  it("fails the deletion when the client cannot be built", async () => {
    const writer = createWriter(new TypeError("fetch failed"));

    await expect(writer.deleteEvent({
      sourceEventId: null,
      sourceEventUid: SOURCE_EVENT_UID,
    })).resolves.toEqual({ error: "fetch failed", success: false });
  });

  it("fails the edit when the client cannot be built", async () => {
    const writer = createWriter(new Error("Invalid credentials: 401 Unauthorized"));

    await expect(writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    )).resolves.toEqual({
      error: "Invalid credentials: 401 Unauthorized",
      success: false,
    });
  });
});
