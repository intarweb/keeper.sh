import { describe, expect, it } from "vitest";

describe("createCalDAVSourceFetcher", () => {
  it("returns a fetchEvents function", async () => {
    const { createCalDAVSourceFetcher } = await import("../../../../src/providers/caldav/source/fetch-adapter");
    const { createSourceIngestionPlan } = await import("../../../../src/core/sync/sync-range");

    const fetcher = createCalDAVSourceFetcher({
      calendarUrl: "https://caldav.example.com/calendar/",
      serverUrl: "https://caldav.example.com",
      username: "user",
      password: "pass",
      plan: createSourceIngestionPlan("1_week", "2_years"),
    });

    expect(typeof fetcher.fetchEvents).toBe("function");
  });
});
