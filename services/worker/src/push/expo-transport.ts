import type {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
  ExpoPushTransport,
} from "./types";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_MAX_BATCH_SIZE = 100;

interface ExpoTransportOptions {
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
}

const readJsonResponse = (response: Response): Promise<unknown> => {
  if (!response.ok) {
    throw new Error(`Expo Push Service returned HTTP ${response.status}`);
  }
  return response.json();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const createHeaders = (accessToken?: string): Headers => {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
};

const createExpoPushTransport = (options: ExpoTransportOptions = {}): ExpoPushTransport => {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const headers = createHeaders(options.accessToken);

  return {
    async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
      if (messages.length > EXPO_MAX_BATCH_SIZE) {
        throw new Error(`Expo push batches cannot exceed ${EXPO_MAX_BATCH_SIZE} messages`);
      }
      const response = await fetchImplementation(EXPO_SEND_URL, {
        body: JSON.stringify(messages),
        headers,
        method: "POST",
      });
      const body = await readJsonResponse(response);
      if (!isRecord(body) || !Array.isArray(body.data)) {
        throw new Error("Expo Push Service returned an invalid ticket response");
      }
      return body.data as ExpoPushTicket[];
    },
    async getReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
      if (ids.length > EXPO_MAX_BATCH_SIZE) {
        throw new Error(`Expo receipt batches cannot exceed ${EXPO_MAX_BATCH_SIZE} IDs`);
      }
      const response = await fetchImplementation(EXPO_RECEIPTS_URL, {
        body: JSON.stringify({ ids }),
        headers,
        method: "POST",
      });
      const body = await readJsonResponse(response);
      if (!isRecord(body) || !isRecord(body.data)) {
        throw new Error("Expo Push Service returned an invalid receipt response");
      }
      return body.data as Record<string, ExpoPushReceipt>;
    },
  };
};

export { createExpoPushTransport, EXPO_RECEIPTS_URL, EXPO_SEND_URL };
export type { ExpoTransportOptions };
