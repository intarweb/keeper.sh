import { describe, expect, it } from "vitest";
import { createCalDAVSourceWriter } from "../../../../src/providers/caldav/source/mutations";

const CALENDAR_URL = "https://caldav.icloud.com/calendars/home";
const SOURCE_EVENT_UID = "source-event-uid-1";
const NO_CONTENT_STATUS = 204;
const OBJECT_URL = `${CALENDAR_URL}/${SOURCE_EVENT_UID}.ics`;

const buildIcs = (organizer: string): string => [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Apple Inc.//iOS 18.0//EN",
  "BEGIN:VEVENT",
  `UID:${SOURCE_EVENT_UID}`,
  "DTSTAMP:20270101T000000Z",
  "DTSTART:20270511T140000Z",
  "DTEND:20270511T150000Z",
  "SUMMARY:Studio booked",
  `ORGANIZER:mailto:${organizer}`,
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const createWriter = (organizer: string, login: string) => {
  const updated: { data: string; url: string }[] = [];
  const client = {
    deleteCalendarObject: () =>
      Promise.resolve(new Response(null, { status: NO_CONTENT_STATUS })),
    fetchCalendarObjects: () =>
      Promise.resolve([{ data: buildIcs(organizer), url: OBJECT_URL }]),
    updateCalendarObject: (request: { calendarObject: { data: string; url: string } }) => {
      updated.push(request.calendarObject);
      return Promise.resolve(new Response(null, { status: NO_CONTENT_STATUS }));
    },
  };

  return {
    updated,
    writer: createCalDAVSourceWriter({
      accountEmail: null,
      accountUsername: login,
      calendarUrl: CALENDAR_URL,
      client: () => Promise.resolve(client),
    }),
  };
};

const rename = (writer: ReturnType<typeof createWriter>["writer"]) =>
  writer.updateEvent(
    { sourceEventId: null, sourceEventUid: SOURCE_EVENT_UID },
    { summary: "Renamed on the destination" },
  );

/*
 * Apple hands one account the same mailbox at @icloud.com, @me.com and @mac.com, and its
 * clients stamp ORGANIZER with whichever of them the account was created under — routinely
 * not the one the user signs in to CalDAV with. Reading that as somebody else's event
 * refuses the user's own calendar and quarantines the pair on the first organized event.
 * No @me.com or @mac.com address has been issued since 2012, so a matching local part
 * across the three cannot belong to a second person.
 */
describe("an iCloud account whose login and organizer use different Apple domains", () => {
  it("writes an event organized by the same name at another Apple domain", async () => {
    const { updated, writer } = createWriter("rida@me.com", "rida@icloud.com");

    const result = await rename(writer);

    expect(result).toEqual({ success: true });
    expect(updated).toHaveLength(1);
  });

  it("writes an event organized by the same name at mac.com", async () => {
    const { updated, writer } = createWriter("rida@mac.com", "rida@icloud.com");

    const result = await rename(writer);

    expect(result).toEqual({ success: true });
    expect(updated).toHaveLength(1);
  });

  it("still refuses another person's event on the same Apple domain", async () => {
    const { updated, writer } = createWriter("colleague@me.com", "rida@icloud.com");

    const result = await rename(writer);

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(updated).toEqual([]);
  });

  it("does not extend the same name to a domain Apple does not own", async () => {
    const { updated, writer } = createWriter("rida@gmail.com", "rida@icloud.com");

    const result = await rename(writer);

    expect(result.refused).toBe("event_authored_by_someone_else");
    expect(updated).toEqual([]);
  });
});
