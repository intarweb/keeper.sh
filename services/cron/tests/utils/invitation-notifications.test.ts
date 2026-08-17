import { describe, expect, it, vi } from "vitest";
import {
  createInvitationNotificationKey,
  enqueueInvitationNotifications,
} from "../../src/utils/invitation-notifications";

type NotificationDatabase = Parameters<typeof enqueueInvitationNotifications>[0];

const createDatabase = (preference?: boolean) => {
  const preferenceRows: { enabled: boolean }[] = [];
  if (preference !== globalThis.undefined) {
    preferenceRows.push({ enabled: preference });
  }
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(preferenceRows) }),
    }),
  }));
  const values = vi.fn(() => ({
    onConflictDoNothing: () => ({
      returning: () => Promise.resolve([{ id: "notification-1" }]),
    }),
  }));
  const insert = vi.fn(() => ({ values }));
  return {
    database: { insert, select } as unknown as NotificationDatabase,
    insert,
    values,
  };
};

const invitation = {
  occurrenceStart: "2026-08-14T16:00:00.000Z",
  sourceEventUid: "provider-event-1",
};

const batch = {
  calendarId: "calendar-1",
  invitations: [invitation],
  userId: "user-1",
};

describe("ingest invitation notification producer", () => {
  it("hashes provider identity and inserts a redacted outbox projection", async () => {
    const { database, values } = createDatabase();
    const idempotencyKey = await createInvitationNotificationKey({
      calendarId: batch.calendarId,
      ...invitation,
      userId: batch.userId,
    });

    await expect(enqueueInvitationNotifications(database, batch)).resolves.toBe(1);
    expect(idempotencyKey).toMatch(/^calendar_invite:[\w-]+$/);
    expect(idempotencyKey).not.toContain("provider-event-1");
    expect(values).toHaveBeenCalledWith([{
      idempotencyKey,
      payload: {
        calendarId: "calendar-1",
        deepLink: { params: { calendarId: "calendar-1" }, path: "/invitations" },
        sourceEventUid: "provider-event-1",
      },
      type: "calendar_invite",
      userId: "user-1",
    }]);
  });

  it("honors opt-out before writing and deduplicates repeated provider entries", async () => {
    const optedOut = createDatabase(false);
    await expect(enqueueInvitationNotifications(optedOut.database, batch)).resolves.toBe(0);
    expect(optedOut.insert).not.toHaveBeenCalled();

    const enabled = createDatabase(true);
    await enqueueInvitationNotifications(enabled.database, {
      ...batch,
      invitations: [invitation, invitation],
    });
    expect(enabled.values).toHaveBeenCalledWith([expect.any(Object)]);
  });
});
