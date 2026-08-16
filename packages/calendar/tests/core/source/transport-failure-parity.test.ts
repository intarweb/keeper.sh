import { afterEach, describe, expect, it, vi } from "vitest";
import { createCalDAVSourceWriter } from "../../../src/providers/caldav/source/mutations";
import { createGoogleSourceWriter } from "../../../src/providers/google/source/mutations";
import { createOutlookSourceWriter } from "../../../src/providers/outlook/source/mutations";
import type { CalendarSourceWriter } from "../../../src/core/source/writer";

const SOURCE_EVENT_ID = "provider-event-id";
const SOURCE_EVENT_UID = "source-event-uid-1";
const CALENDAR_URL = "https://caldav.example.com/calendars/me";
const OBJECT_URL = `${CALENDAR_URL}/${SOURCE_EVENT_UID}.ics`;
const OK_STATUS = 200;

const SOLO_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example//Example//EN",
  "BEGIN:VEVENT",
  `UID:${SOURCE_EVENT_UID}`,
  "DTSTAMP:20270101T000000Z",
  "DTSTART:20270511T140000Z",
  "DTEND:20270511T150000Z",
  "SUMMARY:Dentist",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const severTransport = (): void => {
  globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    if (method !== "GET") {
      return Promise.reject(new TypeError("fetch failed"));
    }
    if (url.includes("graph.microsoft.com")) {
      return Promise.resolve(
        Response.json({ iCalUId: SOURCE_EVENT_UID, id: SOURCE_EVENT_ID }, {
          status: OK_STATUS,
        }),
      );
    }
    return Promise.resolve(
      Response.json(
        { items: [{ iCalUID: SOURCE_EVENT_UID, id: SOURCE_EVENT_ID }] },
        { status: OK_STATUS },
      ),
    );
  }) as unknown as typeof fetch;
};

const createCalDAVWriterOverASeveredSocket = (): CalendarSourceWriter =>
  createCalDAVSourceWriter({
    calendarUrl: CALENDAR_URL,
    client: () =>
      Promise.resolve({
        deleteCalendarObject: () => Promise.reject(new TypeError("fetch failed")),
        fetchCalendarObjects: () =>
          Promise.resolve([{ data: SOLO_ICS, url: OBJECT_URL }]),
        updateCalendarObject: () => Promise.reject(new TypeError("fetch failed")),
      }),
  });

const WRITERS: readonly { create: () => CalendarSourceWriter; name: string }[] = [
  {
    create: () =>
      createGoogleSourceWriter({
        accessToken: () => Promise.resolve("token"),
        externalCalendarId: "primary",
      }),
    name: "Google",
  },
  {
    create: () =>
      createOutlookSourceWriter({ accessToken: () => Promise.resolve("token") }),
    name: "Outlook",
  },
  { create: createCalDAVWriterOverASeveredSocket, name: "CalDAV" },
];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/*
 * The lookup already answers a dropped connection rather than throwing it, because an
 * exception out of a writer is spent as a permanent defect: five of them revert the pair
 * to one-way and discard every edit that had not landed. The final write is the one call
 * that was left unwrapped, and it is the one where the answer matters most — a deletion
 * that never got a status may already have destroyed the real event.
 */
describe.each(WRITERS)("a $name source write whose connection drops", ({ create }) => {
  it("answers the edit as retryable rather than throwing", async () => {
    severTransport();

    const result = await create().updateEvent(
      { sourceEventId: SOURCE_EVENT_ID, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Dentist, moved to Thursday" },
    );

    expect(result.success).toBe(false);
    expect(result.refused).toBeUndefined();
    expect(result.retryable).toBe(true);
  });

  it("answers the deletion as retryable and as an outcome it does not know", async () => {
    severTransport();

    const result = await create().deleteEvent({
      sourceEventId: SOURCE_EVENT_ID,
      sourceEventUid: SOURCE_EVENT_UID,
    });

    expect(result.success).toBe(false);
    expect(result.refused).toBeUndefined();
    expect(result.retryable).toBe(true);
    expect(result.indeterminate).toBe(true);
  });
});
