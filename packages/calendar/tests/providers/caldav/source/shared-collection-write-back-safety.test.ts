import { describe, expect, it } from "vitest";
import { createCalDAVSourceWriter } from "../../../../src/providers/caldav/source/mutations";

const CALENDAR_URL = "https://caldav.example.com/calendars/team";
const SOURCE_EVENT_UID = "source-event-uid-1";
const ACCOUNT_EMAIL = "me@example.com";
const NO_CONTENT_STATUS = 204;
const OBJECT_URL = `${CALENDAR_URL}/${SOURCE_EVENT_UID}.ics`;

/*
 * An object on a collection shared with write access. Nobody is invited, so the attendee
 * guard lets it through; ORGANIZER is the only thing naming its owner.
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

const createWriter = (data: string) => {
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
      accountEmail: ACCOUNT_EMAIL,
      calendarUrl: CALENDAR_URL,
      client: () => Promise.resolve(client),
    }),
  };
};

describe("a CalDAV source write on a collection somebody else owns", () => {
  it("refuses to delete an object another address organizes", async () => {
    const { deleted, writer } = createWriter(
      buildIcs(["ORGANIZER;CN=Colleague:mailto:colleague@example.com"]),
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
    );

    const result = await writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(updated).toEqual([]);
  });

  it("still writes an object this account organizes", async () => {
    const { updated, writer } = createWriter(
      buildIcs(["ORGANIZER;CN=Me:mailto:ME@Example.com"]),
    );

    const result = await writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(result).toEqual({ success: true });
    expect(updated).toHaveLength(1);
  });

  it("still writes an object that names no organizer at all", async () => {
    const { updated, writer } = createWriter(buildIcs([]));

    const result = await writer.updateEvent(
      { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
      { summary: "Renamed on the destination" },
    );

    expect(result).toEqual({ success: true });
    expect(updated).toHaveLength(1);
  });
});
