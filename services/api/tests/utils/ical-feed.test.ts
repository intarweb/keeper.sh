import { describe, expect, it } from "vitest";
import {
  ICAL_FEED_EVENT_LIMIT,
  createIcalFeedQuery,
  generateCalendarFeed,
} from "../../src/utils/ical-feed";
import type { IcalFeedQuery, StoredFeedEvent } from "../../src/utils/ical-feed";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const MS_PER_DAY = 86_400_000;

const shiftDays = (days: number): Date => new Date(NOW.getTime() + days * MS_PER_DAY);

const createStoredEvent = (
  id: string,
  startTime: Date,
  overrides: Partial<StoredFeedEvent> = {},
): StoredFeedEvent => ({
  availability: "busy",
  calendarId: "calendar-1",
  calendarName: "Work",
  description: null,
  endTime: new Date(startTime.getTime() + 3_600_000),
  exceptionDates: null,
  id,
  isAllDay: false,
  location: null,
  recurrenceId: null,
  recurrenceRule: null,
  sourceEventUid: id,
  startTime,
  startTimeZone: "Etc/UTC",
  title: id,
  ...overrides,
});

/** Stands in for the SQL the feed reader issues, so a query that fails to bound
 *  the read produces the same oversized feed the database would return. */
const createReader = (events: StoredFeedEvent[]) =>
  (_calendarIds: string[], query: IcalFeedQuery): Promise<StoredFeedEvent[]> => {
    const withinWindow = events.filter((event) =>
      event.startTime <= query.windowEnd
      && (event.endTime >= query.windowStart || event.recurrenceRule !== null));
    const ordered = withinWindow.toSorted((first, second) =>
      first.startTime.getTime() - second.startTime.getTime());
    return Promise.resolve(ordered.slice(0, query.limit));
  };

const feedFor = (events: StoredFeedEvent[]): Promise<string | null> =>
  generateCalendarFeed("feed-token", {
    now: NOW,
    readFeedCalendars: () => Promise.resolve([{
      id: "calendar-1",
      syncFutureRange: "2_years",
      syncHistoricRange: "1_month",
    }]),
    readFeedEvents: createReader(events),
    readFeedSettings: () => Promise.resolve(null),
    resolveUserIdentifier: () => Promise.resolve("user-1"),
  });

describe("createIcalFeedQuery", () => {
  it("falls back to the default horizon when no calendar configures a wider one", () => {
    const query = createIcalFeedQuery([{
      id: "calendar-1",
      syncFutureRange: "2_years",
      syncHistoricRange: "1_month",
    }], NOW);

    expect(query.windowStart.getTime()).toBeLessThan(NOW.getTime());
    expect(query.windowEnd.getTime()).toBeGreaterThan(shiftDays(700).getTime());
    expect(query.limit).toBe(ICAL_FEED_EVENT_LIMIT);
  });

  /*
   * A hardcoded horizon cut history the user deliberately kept: stored events
   * reach as far back as the widest range configured on any feed calendar.
   */
  it("reaches back as far as the widest historic range across the feed", () => {
    const narrow = createIcalFeedQuery([{
      id: "calendar-1",
      syncFutureRange: "2_years",
      syncHistoricRange: "1_month",
    }], NOW);
    const widest = createIcalFeedQuery([
      { id: "calendar-1", syncFutureRange: "2_years", syncHistoricRange: "1_month" },
      { id: "calendar-2", syncFutureRange: "2_years", syncHistoricRange: "2_years" },
    ], NOW);

    expect(widest.windowStart.getTime()).toBeLessThan(narrow.windowStart.getTime());
    expect(widest.windowStart.getTime()).toBeLessThan(shiftDays(-700).getTime());
  });

  it("ignores an unrecognised stored range instead of widening on it", () => {
    const query = createIcalFeedQuery([{
      id: "calendar-1",
      syncFutureRange: "forever",
      syncHistoricRange: "9_years",
    }], NOW);

    expect(query.windowStart.getTime()).toBeGreaterThan(shiftDays(-400).getTime());
    expect(query.windowEnd.getTime()).toBeGreaterThan(shiftDays(700).getTime());
  });
});

describe("generateCalendarFeed", () => {
  it("returns null for an unknown identifier", async () => {
    const feed = await generateCalendarFeed("feed-token", {
      now: NOW,
      readFeedCalendars: () => Promise.reject(new Error("must not be called")),
      readFeedEvents: () => Promise.reject(new Error("must not be called")),
      readFeedSettings: () => Promise.reject(new Error("must not be called")),
      resolveUserIdentifier: () => Promise.resolve(null),
    });

    expect(feed).toBeNull();
  });

  it("drops events older than the feed horizon while keeping recent history", async () => {
    const feed = await feedFor([
      createStoredEvent("ancient", shiftDays(-1500)),
      createStoredEvent("recent-history", shiftDays(-30)),
    ]);

    expect(feed).not.toContain("ancient");
    expect(feed).toContain("recent-history");
  });

  it("drops events beyond the feed horizon", async () => {
    const feed = await feedFor([
      createStoredEvent("upcoming", shiftDays(30)),
      createStoredEvent("distant", shiftDays(2000)),
    ]);

    expect(feed).toContain("upcoming");
    expect(feed).not.toContain("distant");
  });

  it("keeps a long-running series whose first occurrence predates the horizon", async () => {
    const feed = await feedFor([
      createStoredEvent("weekly-standup", shiftDays(-1500), {
        recurrenceRule: JSON.stringify({ frequency: "WEEKLY", interval: 1 }),
      }),
    ]);

    expect(feed).toContain("weekly-standup");
  });

  it("caps how many events a single feed response serialises", async () => {
    const overflow = ICAL_FEED_EVENT_LIMIT + 10;
    const events = Array.from({ length: overflow }, (_value, index) =>
      createStoredEvent(`event-${index}`, new Date(NOW.getTime() + index * 60_000)));

    const feed = await feedFor(events);

    expect(feed?.split("BEGIN:VEVENT").length ?? 0).toBe(ICAL_FEED_EVENT_LIMIT + 1);
    expect(feed).not.toContain(`event-${overflow - 1}`);
    /*
     * Serialising the cap's worth of events is real work — around half a second
     * locally and ten times that on a loaded runner — so this needs more than the
     * five second default rather than failing as a timeout.
     */
  }, 30_000);

  it("renders an empty calendar when no calendars opt into the feed", async () => {
    const feed = await generateCalendarFeed("feed-token", {
      now: NOW,
      readFeedCalendars: () => Promise.resolve([]),
      readFeedEvents: () => Promise.reject(new Error("must not be called")),
      readFeedSettings: () => Promise.resolve(null),
      resolveUserIdentifier: () => Promise.resolve("user-1"),
    });

    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).not.toContain("BEGIN:VEVENT");
  });
});
