import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPendingOutlookInvites,
  rsvpOutlookEvent,
} from "../../../src/mutations/providers/outlook";

const getRequestUrl = (input: string | URL | Request): string | URL => {
  if (input instanceof Request) {
    return input.url;
  }
  return input;
};

const parseRequestBody = (body: unknown): unknown => {
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  return null;
};

describe("rsvpOutlookEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("targets the selected provider instance when recurring instances share a UID", async () => {
    const sharedUid = "shared-series@example.com";
    const instances = [
      { iCalUId: sharedUid, id: "instance-1" },
      { iCalUId: sharedUid, id: "instance-2" },
    ];
    const requests: { body: unknown; method: string; url: string }[] = [];

    vi.stubGlobal("fetch", vi.fn((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(getRequestUrl(input));
      const method = init?.method ?? "GET";
      const body = parseRequestBody(init?.body);
      requests.push({ body, method, url: url.toString() });

      if (method === "GET") {
        return Response.json(instances[1]);
      }
      return new Response(null, { status: 202 });
    }));

    const result = await rsvpOutlookEvent(
      "access-token",
      { sourceEventId: "instance-2", sourceEventUid: sharedUid },
      "accepted",
    );

    expect(result).toEqual({ success: true });
    expect(requests).toEqual([
      {
        body: null,
        method: "GET",
        url: "https://graph.microsoft.com/v1.0/me/events/instance-2?%24select=id%2CiCalUId",
      },
      {
        body: { sendResponse: true },
        method: "POST",
        url: "https://graph.microsoft.com/v1.0/me/events/instance-2/accept",
      },
    ]);
  });

  it("resolves a legacy recurring RSVP by UID and occurrence start without choosing the first", async () => {
    const sharedUid = "shared-series@example.com";
    const instances = [
      {
        iCalUId: sharedUid,
        id: "instance-1",
        start: { dateTime: "2026-08-14T16:00:00.000", timeZone: "UTC" },
      },
      {
        iCalUId: sharedUid,
        id: "instance-2",
        start: { dateTime: "2026-08-21T16:00:00.000", timeZone: "UTC" },
      },
    ];
    const requests: { method: string; url: string }[] = [];
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(getRequestUrl(input));
      const method = init?.method ?? "GET";
      requests.push({ method, url: url.toString() });
      if (method === "GET") {
        return Response.json({ value: instances });
      }
      return new Response(null, { status: 202 });
    }));

    const result = await rsvpOutlookEvent(
      "access-token",
      {
        occurrenceStart: new Date("2026-08-21T16:00:00.000Z"),
        sourceEventId: null,
        sourceEventUid: sharedUid,
      },
      "accepted",
    );

    expect(result).toEqual({ success: true });
    expect(requests.at(-1)?.url).toContain("/events/instance-2/accept");
  });

  it("carries the provider instance ID in normalized pending invitations", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Response.json({ value: [{
      end: { dateTime: "2026-08-14T17:00:00.000Z", timeZone: "UTC" },
      iCalUId: "shared-series@example.com",
      id: "instance-2",
      start: { dateTime: "2026-08-14T16:00:00.000Z", timeZone: "UTC" },
    }] })));

    const invites = await getPendingOutlookInvites(
      "access-token",
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );

    expect(invites[0]).toMatchObject({
      sourceEventId: "instance-2",
      sourceEventUid: "shared-series@example.com",
    });
  });
});
