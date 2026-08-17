import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getInvites } from "../../../../src/routes/api/v1/calendars/[calendarId]/invites";

const mocks = vi.hoisted(() => ({
  createNotificationIdempotencyKey: vi.fn<
    (type: string, parts: string[]) => Promise<string>
  >(() => Promise.resolve("calendar_invite:hash")),
  enqueueCalendarInviteNotification: vi.fn<
    (userId: string, payload: unknown, idempotencyKey: string) => Promise<string | null>
  >(() => Promise.resolve("notification-1")),
  getPendingInvites: vi.fn<(...arguments_: unknown[]) => Promise<unknown[]>>(),
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
    getPendingInvites: (...arguments_: unknown[]) => mocks.getPendingInvites(...arguments_),
  }),
}));
vi.mock("../../../../src/utils/push-notifications", () => ({
  createNotificationIdempotencyKey: (type: string, parts: string[]) =>
    mocks.createNotificationIdempotencyKey(type, parts),
  enqueueCalendarInviteNotification: (
    userId: string,
    payload: unknown,
    idempotencyKey: string,
  ) => mocks.enqueueCalendarInviteNotification(userId, payload, idempotencyKey),
}));

type RouteHandler = (context: {
  params: Record<string, string>;
  request: Request;
  userId: string;
}) => Promise<Response>;

const invite = {
  calendarId: "calendar-1",
  description: "Sensitive agenda",
  endTime: "2026-08-14T17:00:00.000Z",
  isAllDay: false,
  location: "Private room",
  organizer: "person@example.com",
  provider: "google",
  sourceEventId: "provider-instance-2",
  sourceEventUid: "provider-event-1",
  startTime: "2026-08-14T16:00:00.000Z",
  title: "Secret meeting",
};

const invoke = () => (getInvites as unknown as RouteHandler)({
  params: { calendarId: "calendar-1" },
  request: new Request(
    "https://keeper.sh/api/v1/calendars/calendar-1/invites"
    + "?from=2026-08-14T00:00:00.000Z&to=2026-08-15T00:00:00.000Z",
  ),
  userId: "user-1",
});

beforeEach(() => {
  mocks.createNotificationIdempotencyKey.mockClear();
  mocks.enqueueCalendarInviteNotification.mockClear();
  mocks.getPendingInvites.mockReset();
  mocks.getPendingInvites.mockResolvedValue([invite]);
});

describe("invite notification producer", () => {
  it("keeps the read endpoint side-effect free", async () => {
    const response = await invoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([invite]);
    expect(mocks.createNotificationIdempotencyKey).not.toHaveBeenCalled();
    expect(mocks.enqueueCalendarInviteNotification).not.toHaveBeenCalled();
  });

  it("does not enqueue when discovery returns no invitations", async () => {
    mocks.getPendingInvites.mockResolvedValue([]);

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(mocks.enqueueCalendarInviteNotification).not.toHaveBeenCalled();
  });
});
