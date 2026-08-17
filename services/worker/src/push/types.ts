interface PushNotificationContent {
  body: string;
  data: Record<string, unknown>;
  title: string;
}

interface ClaimedPushDelivery {
  attempts: number;
  id: string;
  installationId: string;
  notificationId: string;
  payload: Record<string, unknown>;
  token: string;
  type: string;
}

interface ClaimedPushReceipt {
  attempts: number;
  id: string;
  installationId: string;
  notificationId: string;
  receiptId: string;
  token: string;
}

interface ExpoPushTicket {
  details?: { error?: string };
  id?: string;
  message?: string;
  status: "error" | "ok";
}

interface ExpoPushReceipt {
  details?: { error?: string };
  message?: string;
  status: "error" | "ok";
}

interface ExpoPushMessage extends PushNotificationContent {
  sound: "default";
  to: string;
}

interface ExpoPushTransport {
  getReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>>;
  send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

interface PushOutboxRepository {
  cleanupTerminal(before: Date, limit: number): Promise<number>;
  claimReceiptBatch(limit: number, now: Date, staleBefore: Date): Promise<ClaimedPushReceipt[]>;
  claimSendBatch(limit: number, now: Date, staleBefore: Date): Promise<ClaimedPushDelivery[]>;
  disableInstallation(installationId: string): Promise<void>;
  markDead(deliveryId: string, error: string): Promise<void>;
  markDelivered(deliveryId: string, deliveredAt: Date): Promise<void>;
  markReceiptPending(deliveryId: string, receiptId: string, checkAt: Date): Promise<void>;
  materializeNotifications(limit: number, now: Date, staleBefore: Date): Promise<number>;
  reconcileNotifications(notificationIds: string[]): Promise<void>;
  retryDelivery(deliveryId: string, attempts: number, error: string, nextAttemptAt: Date): Promise<void>;
  retryReceipt(deliveryId: string, attempts: number, error: string, nextAttemptAt: Date): Promise<void>;
}

export type {
  ClaimedPushDelivery,
  ClaimedPushReceipt,
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
  ExpoPushTransport,
  PushNotificationContent,
  PushOutboxRepository,
};
