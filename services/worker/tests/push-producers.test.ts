import { describe, expect, it, vi } from "vitest";
import { enqueueSyncFailureNotification } from "../src/push/producers";

type ProducerDatabase = Parameters<typeof enqueueSyncFailureNotification>[0];

const createDatabase = (preference?: boolean, insertedId = "notification-1") => {
  const insertedRows: { id: string }[] = [];
  if (insertedId) {
    insertedRows.push({ id: insertedId });
  }
  const preferenceRows: { enabled: boolean }[] = [];
  if (preference !== globalThis.undefined) {
    preferenceRows.push({ enabled: preference });
  }
  const values = vi.fn(() => ({
    onConflictDoNothing: () => ({
      returning: () => Promise.resolve(insertedRows),
    }),
  }));
  const insert = vi.fn(() => ({ values }));
  const limit = vi.fn(() => Promise.resolve(preferenceRows));
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({ limit }),
    }),
  }));
  return {
    database: { insert, select } as unknown as ProducerDatabase,
    insert,
    values,
  };
};

const notification = {
  calendarId: "calendar-1",
  idempotencyKey: "sync-failed:calendar-1:job-1",
  userId: "user-1",
};

describe("sync failure push producer", () => {
  it("honors an explicit opt-out", async () => {
    const { database, insert } = createDatabase(false);

    await expect(enqueueSyncFailureNotification(database, notification)).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("defaults notifications on and enqueues a redacted, idempotent payload", async () => {
    const { database, values } = createDatabase();

    await expect(enqueueSyncFailureNotification(database, notification))
      .resolves.toBe("notification-1");
    expect(values).toHaveBeenCalledWith({
      idempotencyKey: notification.idempotencyKey,
      payload: {
        calendarId: "calendar-1",
        deepLink: { params: { calendarId: "calendar-1" }, path: "/calendar" },
      },
      type: "sync_failed",
      userId: "user-1",
    });
    const serialized = JSON.stringify(values.mock.calls[0]);
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("errorMessage");
  });

  it("treats an idempotency conflict as an already-enqueued notification", async () => {
    const { database } = createDatabase(true, "");

    await expect(enqueueSyncFailureNotification(database, notification)).resolves.toBeNull();
  });
});
