import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchInvite } from "../../../../src/routes/api/v1/calendars/[calendarId]/invites/[source-event-uid]";

const mocks = vi.hoisted(() => ({
  result: { success: true } as { error?: string; success: boolean },
  rsvpInvite: vi.fn(),
}));

vi.mock("../../../../src/utils/middleware", () => ({
  withV1Auth: (handler: unknown) => handler,
  withWideEvent: (handler: unknown) => handler,
}));
vi.mock("../../../../src/context", () => ({
  database: {},
  encryptionKey: "key",
  oauthProviders: {},
  refreshLockStore: {},
}));
vi.mock("../../../../src/read-models", () => ({
  createKeeperApi: () => ({
    rsvpInvite: (...arguments_: unknown[]) => {
      mocks.rsvpInvite(...arguments_);
      return Promise.resolve(mocks.result);
    },
  }),
}));

type RouteHandler = (context: {
  params: Record<string, string>;
  request: Request;
  userId: string;
}) => Promise<Response>;

const invoke = (body: unknown, params?: Record<string, string>) => {
  const resolvedParams = params ?? {
    calendarId: "calendar-1",
    "source-event-uid": "provider-event-1",
  };
  return (patchInvite as unknown as RouteHandler)({
    params: resolvedParams,
    request: new Request("https://keeper.sh/api/v1/calendars/calendar-1/invites/provider-event-1", {
      body: JSON.stringify(body),
      method: "PATCH",
    }),
    userId: "user-1",
  });
};

beforeEach(() => {
  mocks.result = { success: true };
  mocks.rsvpInvite.mockClear();
});

describe("invite RSVP route", () => {
  it("rejects malformed input and missing identifiers", async () => {
    const malformed = await invoke({ rsvpStatus: "unknown" });
    const missing = await invoke({ rsvpStatus: "accepted" }, {});
    expect(malformed.status).toBe(400);
    expect(missing.status).toBe(400);
  });

  it("does not disclose a calendar that is not owned by the caller", async () => {
    mocks.result = { error: "Calendar not found.", success: false };
    const response = await invoke({ rsvpStatus: "accepted" });
    expect(response.status).toBe(400);
  });

  it("addresses the provider invite safely by calendar, UID, and occurrence", async () => {
    const response = await invoke({
      occurrenceStart: "2026-08-14T16:00:00.000Z",
      rsvpStatus: "tentative",
      sourceEventId: "provider-instance-2",
    });
    expect(response.status).toBe(200);
    expect(mocks.rsvpInvite).toHaveBeenCalledWith(
      "user-1",
      "calendar-1",
      "provider-event-1",
      "provider-instance-2",
      "tentative",
      new Date("2026-08-14T16:00:00.000Z"),
    );
  });
});
