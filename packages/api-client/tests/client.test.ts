import { describe, expect, it } from "vitest";
import { KeeperApiClient, KeeperApiError, KeeperContractError } from "../src";

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  Response.json(body, init);

describe("KeeperApiClient", () => {
  it("normalizes self-hosted base paths and applies the auth transport", async () => {
    const observed: Request[] = [];
    const client = new KeeperApiClient({
      baseUrl: "https://calendar.example.test/keeper",
      authTransport: (request) => {
        const headers = new Headers(request.headers);
        headers.set("authorization", "Bearer device-session");
        return new Request(request, { headers });
      },
      fetch: (request) => {
        observed.push(request);
        return Promise.resolve(jsonResponse({ count: 4 }));
      },
    });

    await expect(client.getEventCount()).resolves.toBe(4);
    expect(observed[0]?.url).toBe("https://calendar.example.test/keeper/api/events/count");
    expect(observed[0]?.headers.get("authorization")).toBe("Bearer device-session");
  });

  it("exposes typed status, body, and Retry-After errors", async () => {
    const client = new KeeperApiClient({
      fetch: () => Promise.resolve(jsonResponse(
        { error: "Sync is cooling down" },
        { status: 429, headers: { "retry-after": "37" } },
      )),
    });

    const caught = await client.triggerV1Sync().catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(KeeperApiError);
    expect(caught).toMatchObject({ status: 429, retryAfterSeconds: 37 });
  });

  it("fails closed when a successful response violates its contract", async () => {
    const client = new KeeperApiClient({
      fetch: () => Promise.resolve(jsonResponse({ count: "four" })),
    });

    await expect(client.getEventCount()).rejects.toBeInstanceOf(KeeperContractError);
  });

  it("accepts and normalizes the hosted legacy event-list response", async () => {
    let observed = "";
    const client = new KeeperApiClient({
      fetch: (request) => {
        observed = request.url;
        return Promise.resolve(jsonResponse([{
          id: "event-legacy",
          eventStateId: "state-legacy",
          startTime: "2026-08-14T16:00:00.000Z",
          endTime: "2026-08-14T16:30:00.000Z",
          title: "Planning",
          description: null,
          location: null,
          calendarId: "calendar-1",
          calendarName: "Work",
          calendarProvider: "google",
          calendarUrl: null,
        }]));
      },
    });

    await expect(client.listV1Events({
      from: "2026-08-14T00:00:00.000Z",
      to: "2026-08-15T00:00:00.000Z",
    })).resolves.toEqual([expect.objectContaining({
      availability: "busy",
      isAllDay: false,
    })]);

    const url = new URL(observed);
    expect(url.pathname).toBe("/api/v1/events");
    expect(url.searchParams.get("from")).toBe("2026-08-14T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-08-15T00:00:00.000Z");
  });

  it("normalizes hosted calendar and entitlement rollout responses", async () => {
    const responses = [[{
      id: "calendar-1",
      name: "Work",
      calendarType: "source",
      capabilities: ["pull"],
      accountId: "account-1",
      provider: "google",
      providerName: "Google Calendar",
      providerIcon: null,
      displayName: null,
      email: null,
      accountLabel: "Account",
      accountIdentifier: "account-1",
      needsReauthentication: false,
      includeInIcalFeed: true,
    }], {
      plan: "pro",
      accounts: { current: 1, limit: null },
      mappings: { current: 2, limit: null },
      feeds: { current: 1, limit: null },
      canCustomizeIcalFeed: true,
      canUseEventFilters: true,
    }];
    const client = new KeeperApiClient({
      fetch: () => Promise.resolve(jsonResponse(responses.shift())),
    });

    await expect(client.listSources()).resolves.toEqual([
      expect.objectContaining({ id: "calendar-1", disabled: false }),
    ]);
    await expect(client.getEntitlements()).resolves.toEqual({
      plan: "pro",
      accounts: { current: 1, limit: null },
      mappings: { current: 2, limit: null },
      canCustomizeIcalFeed: true,
      canUseEventFilters: true,
    });
  });

  it("serializes free-time working hours and calendar filters", async () => {
    let observed = "";
    const client = new KeeperApiClient({
      fetch: (request) => {
        observed = request.url;
        return Promise.resolve(jsonResponse({
          from: "2026-08-14T00:00:00.000Z",
          to: "2026-08-15T00:00:00.000Z",
          timezone: "America/Edmonton",
          durationMinutes: 30,
          slots: [],
        }));
      },
    });

    await client.findV1FreeTime({
      from: "2026-08-14T00:00:00.000Z",
      to: "2026-08-15T00:00:00.000Z",
      durationMinutes: 30,
      timezone: "America/Edmonton",
      calendarId: ["one", "two"],
      workingHours: { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5] },
    });

    const url = new URL(observed);
    expect(url.searchParams.get("calendarId")).toBe("one,two");
    expect(url.searchParams.get("workingHoursStart")).toBe("09:00");
    expect(url.searchParams.get("workingHoursEnd")).toBe("17:00");
    expect(url.searchParams.get("workingDays")).toBe("1,2,3,4,5");
  });

  it("supports native device registration and OAuth return URLs", async () => {
    const requests: Request[] = [];
    const client = new KeeperApiClient({
      baseUrl: "https://self-hosted.example.test",
      fetch: (request) => {
        requests.push(request);
        return Promise.resolve(jsonResponse({ installationId: "device-1" }, { status: 201 }));
      },
    });

    await expect(client.registerMobileDevice({
      installationId: "device-1",
      platform: "ios",
      pushToken: "ExponentPushToken[value]",
    })).resolves.toEqual({ installationId: "device-1" });

    const authorizeUrl = client.buildProviderAuthorizeUrl(
      "destination",
      "google",
      "account-1",
      "keeper://oauth/callback",
    );
    expect(requests[0]?.url).toBe("https://self-hosted.example.test/api/mobile/devices");
    expect(authorizeUrl.searchParams.get("destinationId")).toBe("account-1");
    expect(authorizeUrl.searchParams.get("returnTo")).toBe("keeper://oauth/callback");
    expect(() => client.buildProviderAuthorizeUrl("source", "google", "", "keeper://oauth/other"))
      .toThrow("exact callback");
    expect(() => client.buildProviderAuthorizeUrl("source", "google", "", `keeper://oauth/callback?padding=${"x".repeat(2048)}`))
      .toThrow("2048");
  });

  it("rejects empty and oversized OAuth redemption tickets before a request", () => {
    const client = new KeeperApiClient({ fetch: () => Promise.reject(new Error("must not fetch")) });
    expect(() => client.redeemMobileOAuthTicket("")).toThrow("1024");
    expect(() => client.redeemMobileOAuthTicket("x".repeat(1025))).toThrow("1024");
  });

  it("uses the mapping envelopes and calendarIds mutation key", async () => {
    const requests: Request[] = [];
    const client = new KeeperApiClient({
      fetch: (request) => {
        requests.push(request);
        if (request.method === "GET") {
          return Promise.resolve(jsonResponse({ destinationIds: ["destination-1"] }));
        }
        return Promise.resolve(jsonResponse({ success: true }));
      },
    });

    await expect(client.getSourceDestinations("source/1")).resolves.toEqual(["destination-1"]);
    await client.setSourceDestinations("source/1", { calendarIds: ["destination-1"] });

    expect(new URL(requests[0]?.url ?? "https://invalid.test").pathname).toBe("/api/sources/source%2F1/destinations");
    expect(requests[1]?.method).toBe("PUT");
    await expect(requests[1]?.json()).resolves.toEqual({ calendarIds: ["destination-1"] });
  });

  it("matches RSVP, iCal settings, and mobile endpoint methods and payloads", async () => {
    const requests: Request[] = [];
    const responses = [
      { rsvpStatus: "accepted" },
      {
        userId: "user-1",
        includeEventName: true,
        includeEventDescription: false,
        includeEventLocation: false,
        excludeAllDayEvents: false,
        customEventName: "Busy",
      },
      { invites: false, reauthentication: true, syncFailures: true },
      {
        flow: "source",
        provider: "google",
        resourceId: "calendar-1",
        status: "success",
        expiresAt: Date.now() + 60_000,
      },
      { url: "https://keeper.sh/dashboard/billing" },
    ];
    const client = new KeeperApiClient({
      fetch: (request) => {
        requests.push(request);
        return Promise.resolve(jsonResponse(responses.shift()));
      },
    });

    await client.rsvpV1Event("event:1", "accepted");
    await client.updateIcalSettings({ includeEventName: true });
    await client.updateNotificationPreferences({ invites: false });
    await client.redeemMobileOAuthTicket("one-time-ticket");
    await expect(client.getMobilePlanManagementUrl()).resolves.toBe("https://keeper.sh/dashboard/billing");

    expect(requests.map(({ method }) => method)).toEqual(["PATCH", "PATCH", "PATCH", "POST", "GET"]);
    expect(new URL(requests[0]?.url ?? "https://invalid.test").pathname).toBe("/api/v1/events/event%3A1");
    await expect(requests[0]?.json()).resolves.toEqual({ rsvpStatus: "accepted" });
    await expect(requests[1]?.json()).resolves.toEqual({ includeEventName: true });
    await expect(requests[2]?.json()).resolves.toEqual({ invites: false });
    await expect(requests[3]?.json()).resolves.toEqual({ ticket: "one-time-ticket" });
  });

  it("uses the dedicated recurrence-safe invite RSVP route", async () => {
    const observed: Request[] = [];
    const client = new KeeperApiClient({
      fetch: (request) => {
        observed.push(request);
        return Promise.resolve(jsonResponse({ rsvpStatus: "tentative" }));
      },
    });

    await expect(client.rsvpV1Invite(
      "calendar/1",
      "provider:event/1",
      {
        rsvpStatus: "tentative",
        occurrenceStart: "2026-08-14T16:00:00.000Z",
        sourceEventId: "provider-instance-2",
      },
    )).resolves.toEqual({ rsvpStatus: "tentative" });

    expect(observed[0]?.method).toBe("PATCH");
    expect(new URL(observed[0]?.url ?? "https://invalid.test").pathname).toBe(
      "/api/v1/calendars/calendar%2F1/invites/provider%3Aevent%2F1",
    );
    await expect(observed[0]?.json()).resolves.toEqual({
      rsvpStatus: "tentative",
      occurrenceStart: "2026-08-14T16:00:00.000Z",
      sourceEventId: "provider-instance-2",
    });
  });
});
