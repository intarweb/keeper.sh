import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPushOutboxProcessor, getBackoffMs, toContent } from "../src/push/outbox-processor";
import type {
  ClaimedPushDelivery,
  ClaimedPushReceipt,
  ExpoPushReceipt,
  ExpoPushTicket,
  PushOutboxRepository,
} from "../src/push/types";

const NOW = new Date("2026-08-14T12:00:00.000Z");

const delivery: ClaimedPushDelivery = {
  attempts: 0,
  id: "delivery-1",
  installationId: "installation-1",
  notificationId: "notification-1",
  payload: {
    calendarId: "calendar-1",
    deepLink: { params: { calendarId: "calendar-1" }, path: "/calendar" },
    eventTitle: "Private board meeting",
    organizer: "user@example.com",
  },
  token: "ExponentPushToken[test]",
  type: "sync_failed",
};

const createRepository = () => {
  const repository: PushOutboxRepository = {
    cleanupTerminal: vi.fn(() => Promise.resolve(0)),
    claimReceiptBatch: vi.fn(() => Promise.resolve([])),
    claimSendBatch: vi.fn(() => Promise.resolve([])),
    disableInstallation: vi.fn(() => Promise.resolve()),
    markDead: vi.fn(() => Promise.resolve()),
    markDelivered: vi.fn(() => Promise.resolve()),
    markReceiptPending: vi.fn(() => Promise.resolve()),
    materializeNotifications: vi.fn(() => Promise.resolve(1)),
    reconcileNotifications: vi.fn(() => Promise.resolve()),
    retryDelivery: vi.fn(() => Promise.resolve()),
    retryReceipt: vi.fn(() => Promise.resolve()),
  };
  return repository;
};

const createTransport = () => ({
  getReceipts: vi.fn((_ids: string[]) =>
    Promise.resolve({} as Record<string, ExpoPushReceipt>)),
  send: vi.fn((_messages: unknown[]) => Promise.resolve([] as ExpoPushTicket[])),
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("durable push outbox processor", () => {
  it("does not transmit provider invitation UIDs through Expo", () => {
    const content = toContent({
      ...delivery,
      payload: {
        calendarId: "calendar-1",
        sourceEventUid: "organizer@example.com",
      },
      type: "calendar_invite",
    });

    expect(JSON.stringify(content)).not.toContain("organizer@example.com");
  });

  it("sends privacy-redacted Expo content and waits for a receipt", async () => {
    const repository = createRepository();
    vi.mocked(repository.claimSendBatch).mockResolvedValue([delivery]);
    const transport = createTransport();
    transport.send.mockResolvedValue([{ id: "receipt-1", status: "ok" }]);
    const processor = createPushOutboxProcessor({
      batchSize: 50,
      now: () => NOW,
      repository,
      transport,
    });

    const result = await processor.processOnce();

    expect(result).toMatchObject({ materialized: 1, receiptPending: 1, sent: 1 });
    expect(transport.send).toHaveBeenCalledWith([expect.objectContaining({
      body: "Open Keeper to review the affected calendar.",
      title: "Calendar sync needs attention",
      to: "ExponentPushToken[test]",
    })]);
    const serializedMessage = JSON.stringify(transport.send.mock.calls[0]);
    expect(serializedMessage).not.toContain("Private board meeting");
    expect(serializedMessage).not.toContain("user@example.com");
    expect(repository.markReceiptPending).toHaveBeenCalledWith(
      "delivery-1",
      "receipt-1",
      new Date("2026-08-14T12:00:15.000Z"),
    );
  });

  it("marks successful receipts delivered", async () => {
    const repository = createRepository();
    const receiptDelivery: ClaimedPushReceipt = {
      attempts: 0,
      id: "delivery-1",
      installationId: "installation-1",
      notificationId: "notification-1",
      receiptId: "receipt-1",
      token: "ExponentPushToken[test]",
    };
    vi.mocked(repository.claimReceiptBatch).mockResolvedValue([receiptDelivery]);
    const transport = createTransport();
    transport.getReceipts.mockResolvedValue({ "receipt-1": { status: "ok" } });

    const result = await createPushOutboxProcessor({
      batchSize: 50,
      now: () => NOW,
      repository,
      transport,
    }).processOnce();

    expect(result.delivered).toBe(1);
    expect(repository.markDelivered).toHaveBeenCalledWith("delivery-1", NOW);
    expect(repository.reconcileNotifications).toHaveBeenCalledWith(["notification-1"]);
  });

  it("disables tokens rejected as unregistered", async () => {
    const repository = createRepository();
    vi.mocked(repository.claimSendBatch).mockResolvedValue([delivery]);
    const transport = createTransport();
    transport.send.mockResolvedValue([{
      details: { error: "DeviceNotRegistered" },
      message: "Device is no longer registered",
      status: "error",
    }]);

    const result = await createPushOutboxProcessor({
      batchSize: 50,
      now: () => NOW,
      repository,
      transport,
    }).processOnce();

    expect(result.dead).toBe(1);
    expect(repository.disableInstallation).toHaveBeenCalledWith("installation-1");
    expect(repository.markDead).toHaveBeenCalledWith("delivery-1", "DeviceNotRegistered");
  });

  it("retries receipt polling without sending a duplicate notification", async () => {
    const repository = createRepository();
    const receiptDelivery: ClaimedPushReceipt = {
      attempts: 0,
      id: "delivery-1",
      installationId: "installation-1",
      notificationId: "notification-1",
      receiptId: "receipt-1",
      token: "ExponentPushToken[test]",
    };
    vi.mocked(repository.claimReceiptBatch).mockResolvedValue([receiptDelivery]);
    const transport = createTransport();

    const result = await createPushOutboxProcessor({
      batchSize: 50,
      now: () => NOW,
      repository,
      transport,
    }).processOnce();

    expect(result.retried).toBe(1);
    expect(repository.retryReceipt).toHaveBeenCalledWith(
      "delivery-1",
      1,
      "Expo receipt is not available yet",
      new Date(NOW.getTime() + getBackoffMs(1)),
    );
    expect(repository.retryDelivery).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("retries transient transport failures with bounded exponential backoff", async () => {
    const repository = createRepository();
    vi.mocked(repository.claimSendBatch).mockResolvedValue([delivery]);
    const transport = createTransport();
    transport.send.mockRejectedValue(new Error("temporary outage"));

    const result = await createPushOutboxProcessor({
      batchSize: 50,
      now: () => NOW,
      repository,
      transport,
    }).processOnce();

    expect(result.retried).toBe(1);
    expect(repository.retryDelivery).toHaveBeenCalledWith(
      "delivery-1",
      1,
      "temporary outage",
      new Date(NOW.getTime() + getBackoffMs(1)),
    );
    expect(getBackoffMs(100)).toBe(3_600_000);
  });

  it("caps database and Expo work at 100 and performs bounded retention cleanup", async () => {
    const repository = createRepository();
    const transport = createTransport();

    await createPushOutboxProcessor({
      batchSize: 500,
      now: () => NOW,
      repository,
      transport,
    }).processOnce();

    expect(repository.cleanupTerminal).toHaveBeenCalledWith(
      new Date("2026-07-15T12:00:00.000Z"),
      100,
    );
    expect(repository.materializeNotifications).toHaveBeenCalledWith(100, NOW, expect.any(Date));
    expect(repository.claimSendBatch).toHaveBeenCalledWith(100, NOW, expect.any(Date));
    expect(repository.claimReceiptBatch).toHaveBeenCalledWith(100, NOW, expect.any(Date));
  });

  it("redacts push tokens and bearer credentials from persisted transport errors", async () => {
    const repository = createRepository();
    vi.mocked(repository.claimSendBatch).mockResolvedValue([delivery]);
    const transport = createTransport();
    transport.send.mockRejectedValue(new Error(
      "failed ExponentPushToken[sensitive-token] with Bearer access-secret",
    ));

    await createPushOutboxProcessor({
      batchSize: 50,
      now: () => NOW,
      repository,
      transport,
    }).processOnce();

    expect(repository.retryDelivery).toHaveBeenCalledWith(
      "delivery-1",
      1,
      "failed [REDACTED_PUSH_TOKEN] with Bearer [REDACTED]",
      expect.any(Date),
    );
  });
});
