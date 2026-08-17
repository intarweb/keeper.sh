import type {
  ClaimedPushDelivery,
  ClaimedPushReceipt,
  ExpoPushReceipt,
  ExpoPushTicket,
  ExpoPushTransport,
  PushNotificationContent,
  PushOutboxRepository,
} from "./types";

const MAX_ATTEMPTS = 8;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;
const RECEIPT_DELAY_MS = 15_000;
const STALE_CLAIM_MS = 5 * 60_000;
const ERROR_LIMIT = 500;
const EXPO_MAX_BATCH_SIZE = 100;
const TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60_000;

interface PushProcessorOptions {
  batchSize: number;
  now?: () => Date;
  onEvent?: (name: string, fields: Record<string, unknown>) => void;
  repository: PushOutboxRepository;
  transport: ExpoPushTransport;
}

interface PushProcessorResult {
  cleaned: number;
  dead: number;
  delivered: number;
  materialized: number;
  receiptPending: number;
  retried: number;
  sent: number;
}

const createEmptyResult = (): PushProcessorResult => ({
  cleaned: 0,
  dead: 0,
  delivered: 0,
  materialized: 0,
  receiptPending: 0,
  retried: 0,
  sent: 0,
});

const sanitizeError = (value: unknown): string => {
  let message = "Push transport failed";
  if (value instanceof Error) {
    ({ message } = value);
  } else if (typeof value === "string") {
    message = value;
  }
  return message
    .replaceAll(/ExponentPushToken\[[^\]]+\]/giu, "[REDACTED_PUSH_TOKEN]")
    .replaceAll(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .slice(0, ERROR_LIMIT);
};

const getExpoError = (result: ExpoPushReceipt | ExpoPushTicket): string =>
  result.details?.error ?? result.message ?? "Expo push delivery failed";

const isUnregisteredDevice = (error: string): boolean => error === "DeviceNotRegistered";

const isPermanentError = (error: string): boolean =>
  isUnregisteredDevice(error)
  || error === "MessageTooBig"
  || error === "InvalidCredentials"
  || error === "MismatchSenderId";

const getBackoffMs = (attempts: number): number =>
  Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(Math.max(0, attempts - 1), 8));

const readPayloadString = (payload: Record<string, unknown>, key: string): string | null => {
  const value = payload[key];
  if (typeof value === "string") {
    return value;
  }
  return null;
};

const toContent = (delivery: ClaimedPushDelivery): PushNotificationContent => {
  if (delivery.type === "reauthentication_required") {
    const accountId = readPayloadString(delivery.payload, "accountId");
    const provider = readPayloadString(delivery.payload, "provider");
    return {
      body: "Open Keeper to restore calendar sync.",
      data: {
        accountId,
        deepLink: { params: { id: accountId }, path: "/accounts/[id]" },
        notificationType: delivery.type,
        provider,
      },
      title: "Reconnect a calendar account",
    };
  }
  if (delivery.type === "calendar_invite") {
    const calendarId = readPayloadString(delivery.payload, "calendarId");
    return {
      body: "Open Keeper to review and respond.",
      data: {
        calendarId,
        deepLink: { params: { calendarId }, path: "/invitations" },
        notificationType: delivery.type,
      },
      title: "New calendar invitation",
    };
  }
  const calendarId = readPayloadString(delivery.payload, "calendarId");
  return {
    body: "Open Keeper to review the affected calendar.",
    data: {
      calendarId,
      deepLink: { params: { calendarId }, path: "/calendar" },
      notificationType: delivery.type,
    },
    title: "Calendar sync needs attention",
  };
};

const uniqueNotificationIds = (
  deliveries: { notificationId: string }[],
): string[] => [...new Set(deliveries.map(({ notificationId }) => notificationId))];

const createPushOutboxProcessor = (options: PushProcessorOptions) => {
  const now = options.now ?? (() => new Date());

  const retry = async (
    delivery: ClaimedPushDelivery | ClaimedPushReceipt,
    error: unknown,
    result: PushProcessorResult,
    stage: "receipt" | "send",
  ): Promise<void> => {
    const attempts = delivery.attempts + 1;
    const message = sanitizeError(error);
    if (attempts >= MAX_ATTEMPTS) {
      await options.repository.markDead(delivery.id, message);
      result.dead += 1;
      return;
    }
    const nextAttemptAt = new Date(now().getTime() + getBackoffMs(attempts));
    const retryOperations = {
      receipt: options.repository.retryReceipt,
      send: options.repository.retryDelivery,
    };
    await retryOperations[stage](delivery.id, attempts, message, nextAttemptAt);
    result.retried += 1;
  };

  const handleFailure = async (
    delivery: ClaimedPushDelivery | ClaimedPushReceipt,
    error: string,
    result: PushProcessorResult,
    stage: "receipt" | "send",
  ): Promise<void> => {
    if (isUnregisteredDevice(error)) {
      await options.repository.disableInstallation(delivery.installationId);
    }
    if (isPermanentError(error)) {
      await options.repository.markDead(delivery.id, error);
      result.dead += 1;
      return;
    }
    await retry(delivery, error, result, stage);
  };

  const sendBatch = async (
    deliveries: ClaimedPushDelivery[],
    result: PushProcessorResult,
  ): Promise<void> => {
    if (deliveries.length === 0) {
      return;
    }
    const messages = deliveries.map((delivery) => ({
      ...toContent(delivery),
      sound: "default" as const,
      to: delivery.token,
    }));
    const sendResult = await options.transport.send(messages)
      .then((tickets) => ({ tickets }), (error: unknown) => ({ error }));
    if ("error" in sendResult) {
      await Promise.all(
        deliveries.map((delivery) => retry(delivery, sendResult.error, result, "send")),
      );
      return;
    }
    const { tickets } = sendResult;

    for (const [index, delivery] of deliveries.entries()) {
      const ticket = tickets[index];
      if (!ticket) {
        await retry(delivery, "Expo omitted a push ticket", result, "send");
      } else if (ticket.status === "ok" && ticket.id) {
        await options.repository.markReceiptPending(
          delivery.id,
          ticket.id,
          new Date(now().getTime() + RECEIPT_DELAY_MS),
        );
        result.receiptPending += 1;
      } else {
        await handleFailure(delivery, getExpoError(ticket), result, "send");
      }
      result.sent += 1;
    }
  };

  const checkReceipts = async (
    deliveries: ClaimedPushReceipt[],
    result: PushProcessorResult,
  ): Promise<void> => {
    if (deliveries.length === 0) {
      return;
    }
    const receiptResult = await options.transport.getReceipts(
        deliveries.map(({ receiptId }) => receiptId),
      )
      .then((receipts) => ({ receipts }), (error: unknown) => ({ error }));
    if ("error" in receiptResult) {
      await Promise.all(
        deliveries.map((delivery) => retry(delivery, receiptResult.error, result, "receipt")),
      );
      return;
    }
    const { receipts } = receiptResult;
    for (const delivery of deliveries) {
      const receipt = receipts[delivery.receiptId];
      if (!receipt) {
        await retry(delivery, "Expo receipt is not available yet", result, "receipt");
      } else if (receipt.status === "ok") {
        await options.repository.markDelivered(delivery.id, now());
        result.delivered += 1;
      } else {
        await handleFailure(delivery, getExpoError(receipt), result, "receipt");
      }
    }
  };

  const processOnce = async (): Promise<PushProcessorResult> => {
    const result = createEmptyResult();
    const currentTime = now();
    const batchSize = Math.min(Math.max(1, options.batchSize), EXPO_MAX_BATCH_SIZE);
    const staleBefore = new Date(currentTime.getTime() - STALE_CLAIM_MS);
    result.cleaned = await options.repository.cleanupTerminal(
      new Date(currentTime.getTime() - TERMINAL_RETENTION_MS),
      batchSize,
    );
    result.materialized = await options.repository.materializeNotifications(
      batchSize,
      currentTime,
      staleBefore,
    );
    const sendDeliveries = await options.repository.claimSendBatch(
      batchSize,
      currentTime,
      staleBefore,
    );
    await sendBatch(sendDeliveries, result);
    const receiptDeliveries = await options.repository.claimReceiptBatch(
      batchSize,
      currentTime,
      staleBefore,
    );
    await checkReceipts(receiptDeliveries, result);
    await options.repository.reconcileNotifications(uniqueNotificationIds([
      ...sendDeliveries,
      ...receiptDeliveries,
    ]));
    options.onEvent?.("push_outbox.batch", { ...result });
    return result;
  };

  return { processOnce };
};

export { createPushOutboxProcessor, getBackoffMs, toContent };
export type { PushProcessorOptions, PushProcessorResult };
