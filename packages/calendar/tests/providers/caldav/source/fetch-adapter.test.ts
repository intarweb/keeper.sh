import { afterEach, describe, expect, it, vi } from "vitest";
import { isCalDAVEventInSyncWindow } from "../../../../src/providers/caldav/source/fetch-adapter";

const SYNC_WINDOW = {
  timeMax: new Date("2026-06-01T00:00:00.000Z"),
  timeMin: new Date("2026-03-01T00:00:00.000Z"),
};

describe("isCalDAVEventInSyncWindow", () => {
  it("drops a non-recurring event that ends exactly at the window start", () => {
    expect(isCalDAVEventInSyncWindow({
      endTime: SYNC_WINDOW.timeMin,
      startTime: new Date("2026-02-28T23:00:00.000Z"),
    }, SYNC_WINDOW)).toBe(false);
  });

  it("drops a non-recurring event that starts exactly at the window end", () => {
    expect(isCalDAVEventInSyncWindow({
      endTime: new Date("2026-06-01T01:00:00.000Z"),
      startTime: SYNC_WINDOW.timeMax,
    }, SYNC_WINDOW)).toBe(false);
  });

  it("keeps a non-recurring event overlapping either boundary by a moment", () => {
    expect(isCalDAVEventInSyncWindow({
      endTime: new Date("2026-03-01T00:00:00.001Z"),
      startTime: new Date("2026-02-28T23:00:00.000Z"),
    }, SYNC_WINDOW)).toBe(true);
    expect(isCalDAVEventInSyncWindow({
      endTime: new Date("2026-06-01T01:00:00.000Z"),
      startTime: new Date("2026-05-31T23:59:59.999Z"),
    }, SYNC_WINDOW)).toBe(true);
  });

  it("keeps an all-day event ending at midnight on the window start", () => {
    expect(isCalDAVEventInSyncWindow({
      endTime: new Date("2026-03-02T00:00:00.000Z"),
      startTime: new Date("2026-03-01T00:00:00.000Z"),
    }, SYNC_WINDOW)).toBe(true);
  });

  it("keeps a recurring master that lies entirely before the window", () => {
    expect(isCalDAVEventInSyncWindow({
      endTime: new Date("2020-01-01T01:00:00.000Z"),
      recurrenceRule: { frequency: "WEEKLY" },
      startTime: new Date("2020-01-01T00:00:00.000Z"),
    }, SYNC_WINDOW)).toBe(true);
  });
});

const GOOD_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Keeper Test//EN",
  "BEGIN:VEVENT",
  "UID:event-1",
  "SUMMARY:Standup",
  "DTSTART:20260315T090000Z",
  "DTEND:20260315T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const buildFetcher = async (objects: { data?: string }[]) => {
  vi.resetModules();
  vi.doMock("../../../../src/providers/caldav/shared/client", () => ({
    CalDAVClient: function CalDAVClientStub() {
      return {
        fetchCalendarObjects: () => Promise.resolve(objects),
        resolveCalendarUrl: () => Promise.resolve("https://dav.example.com/cal/"),
      };
    },
  }));
  const { createCalDAVSourceFetcher } = await import(
    "../../../../src/providers/caldav/source/fetch-adapter"
  );
  return createCalDAVSourceFetcher({
    calendarUrl: "https://dav.example.com/cal/",
    password: "password",
    plan: {
      futureRange: "2_years",
      historicRange: "1_month",
      window: SYNC_WINDOW,
    },
    serverUrl: "https://dav.example.com",
    username: "user",
  });
};

describe("createCalDAVSourceFetcher partial responses", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../../../src/providers/caldav/shared/client");
  });

  it("returns events when every requested object carries calendar data", async () => {
    const fetcher = await buildFetcher([{ data: GOOD_ICS }]);

    const result = await fetcher.fetchEvents();

    expect(result.events.map((event) => event.uid)).toEqual(["event-1"]);
  });

  it("refuses to treat a response missing calendar data as authoritative", async () => {
    const fetcher = await buildFetcher([{ data: GOOD_ICS }, {}]);

    await expect(fetcher.fetchEvents()).rejects.toThrow(
      "CalDAV returned 1 of 2 calendar objects without data",
    );
  });

  it("reports the counts needed to diagnose a partial response", async () => {
    const fetcher = await buildFetcher([{ data: GOOD_ICS }, {}, {}]);

    await expect(fetcher.fetchEvents()).rejects.toMatchObject({
      missingCount: 2,
      name: "CalDAVPartialResponseError",
      returnedCount: 3,
    });
  });
});
