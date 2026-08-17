import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateDeterministicEventUid } from "../../../../src/core/events/identity";
import { createCalDAVSyncProvider } from "../../../../src/providers/caldav/destination/provider";

const CALENDAR_URL = "https://caldav.example.com/calendar/";
const SIBLING_URL = "https://caldav.example.com/personal/";

const BARE_HREF = "/personal/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const BARE_URL = `https://caldav.example.com${BARE_HREF}`;
const SUFFIXED_HREF = "/personal/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.ics";
const SUFFIXED_URL = `https://caldav.example.com${SUFFIXED_HREF}`;

const davMocks = vi.hoisted(() => ({
  calendarQuery: vi.fn(),
  createCalendarObject: vi.fn(),
  deleteCalendarObject: vi.fn(),
  fetchCalendars: vi.fn(),
  fetchCalendarObjects: vi.fn(),
  updateCalendarObject: vi.fn(),
}));

vi.mock("tsdav", () => ({
  DAVNamespaceShort: { DAV: "d" },
  createDAVClient: () => Promise.resolve(davMocks),
}));

const buildCopyIcs = (uid: string): string =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Some Client//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20260301T120000Z",
    "DTSTART:20260308T140000Z",
    "DTEND:20260308T150000Z",
    "SUMMARY:Meeting",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

const createProvider = () =>
  createCalDAVSyncProvider({
    calendarUrl: CALENDAR_URL,
    password: "pass",
    serverUrl: "https://caldav.example.com",
    username: "user",
  });

const probe = (uid: string): Promise<string> => {
  const provider = createProvider() as unknown as {
    probeRemoteEvent?: (
      reference: { deleteId: string; uid: string },
    ) => Promise<string>;
  };
  if (!provider.probeRemoteEvent) {
    throw new Error("The CalDAV destination provider cannot confirm a copy is gone");
  }
  return provider.probeRemoteEvent({ deleteId: uid, uid });
};

/*
 * The copy was dragged out of the mirror collection into a sibling one. The receiving
 * client chose the resource name, and the UID travelled with the event. Every request the
 * probe makes is answered: the sibling's REPORT names the resource and a multiget of it
 * returns the copy in full.
 */
const stubMovedCopy = (uid: string, href: string, url: string): void => {
  davMocks.fetchCalendars.mockResolvedValue([
    { components: ["VEVENT"], ctag: "ctag-1", displayName: "Mirror", url: CALENDAR_URL },
    { components: ["VEVENT"], ctag: "ctag-2", displayName: "Personal", url: SIBLING_URL },
  ]);
  davMocks.calendarQuery.mockImplementation((params: { url: string }) => {
    if (params.url === SIBLING_URL) {
      return Promise.resolve([{ href, status: 200 }]);
    }
    return Promise.resolve([]);
  });
  davMocks.fetchCalendarObjects.mockImplementation(
    (params: { objectUrls?: string[] }) => {
      const requested = params.objectUrls ?? [];
      if (requested.some((entry) => entry.endsWith(href))) {
        return Promise.resolve([{ data: buildCopyIcs(uid), url }]);
      }
      return Promise.resolve([]);
    },
  );
};

describe("CalDAV destination: a copy moved into a sibling collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is found when the receiving client suffixed the resource with .ics", async () => {
    const uid = generateDeterministicEventUid("event-state-id-1");
    stubMovedCopy(uid, SUFFIXED_HREF, SUFFIXED_URL);

    await expect(probe(uid)).resolves.toBe("present");
  });

  /*
   * CalDAV lets the client name the resource and RFC 4791 does not require a .ics suffix.
   * The copy is plainly there and the server says so, but isCalendarObjectPath drops the
   * href before the multiget is even asked, so the sweep the probe performs to catch a
   * moved copy answers "absent" — the one answer that destroys the user's real event on
   * the source calendar.
   */
  it("is still a copy when the receiving client did not", async () => {
    const uid = generateDeterministicEventUid("event-state-id-1");
    stubMovedCopy(uid, BARE_HREF, BARE_URL);

    await expect(probe(uid)).resolves.toBe("present");
  });
});
