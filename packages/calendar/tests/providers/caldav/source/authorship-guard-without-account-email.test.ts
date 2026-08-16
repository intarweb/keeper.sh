import { describe, expect, it } from "vitest";
import { createCalDAVSourceWriter } from "../../../../src/providers/caldav/source/mutations";

const CALENDAR_URL = "https://caldav.example.com/calendars/team";
const SOURCE_EVENT_UID = "source-event-uid-1";
const NO_CONTENT_STATUS = 204;
const OBJECT_URL = `${CALENDAR_URL}/${SOURCE_EVENT_UID}.ics`;

/*
 * Production never stores an email on a CalDAV calendar account, so the writer is built
 * the way resolveCalDAVSourceWriter builds it for iCloud, Fastmail and every other
 * CalDAV server: no account email, only the login the credential was created with.
 */
const buildIcs = (organizers: string[]): string => [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example//Example//EN",
  "BEGIN:VEVENT",
  `UID:${SOURCE_EVENT_UID}`,
  "DTSTAMP:20270101T000000Z",
  "DTSTART:20270511T140000Z",
  "DTEND:20270511T150000Z",
  "SUMMARY:Studio booked",
  ...organizers,
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const createWriter = (data: string, accountUsername: string | null) => {
  const deleted: string[] = [];
  const updated: { data: string; url: string }[] = [];
  const client = {
    deleteCalendarObject: (request: { calendarObject: { url: string } }) => {
      deleted.push(request.calendarObject.url);
      return Promise.resolve(new Response(null, { status: NO_CONTENT_STATUS }));
    },
    fetchCalendarObjects: () => Promise.resolve([{ data, url: OBJECT_URL }]),
    updateCalendarObject: (request: { calendarObject: { data: string; url: string } }) => {
      updated.push(request.calendarObject);
      return Promise.resolve(new Response(null, { status: NO_CONTENT_STATUS }));
    },
  };

  return {
    deleted,
    updated,
    writer: createCalDAVSourceWriter({
      accountEmail: null,
      accountUsername,
      calendarUrl: CALENDAR_URL,
      client: () => Promise.resolve(client),
    }),
  };
};

describe("a CalDAV source write when the account carries no stored email", () => {
  it("refuses to delete an object another address organizes", async () => {
    const { deleted, writer } = createWriter(
      buildIcs(["ORGANIZER;CN=Colleague:mailto:colleague@example.com"]),
      "me@example.com",
    );

    const result = await writer.deleteEvent({
      sourceEventId: null,
      sourceEventUid: SOURCE_EVENT_UID,
    });

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(deleted).toEqual([]);
  });

  it("refuses to edit an object another address organizes", async () => {
    const { updated, writer } = createWriter(
      buildIcs(["ORGANIZER:mailto:colleague@example.com"]),
      "me@example.com",
    );

    const result = await writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(updated).toEqual([]);
  });

  it("still writes an object the login address organizes", async () => {
    const { updated, writer } = createWriter(
      buildIcs(["ORGANIZER;CN=Me:mailto:ME@Example.com"]),
      "me@example.com",
    );

    const result = await writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(result).toEqual({ success: true });
    expect(updated).toHaveLength(1);
  });

  it("refuses an organized object when the login names no address to compare", async () => {
    const { deleted, writer } = createWriter(
      buildIcs(["ORGANIZER;CN=Colleague:mailto:colleague@example.com"]),
      "nextcloud-admin",
    );

    const result = await writer.deleteEvent({
      sourceEventId: null,
      sourceEventUid: SOURCE_EVENT_UID,
    });

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(deleted).toEqual([]);
  });

  it("still writes an object that names no organizer at all", async () => {
    const { updated, writer } = createWriter(buildIcs([]), "nextcloud-admin");

    const result = await writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(result).toEqual({ success: true });
    expect(updated).toHaveLength(1);
  });
});
