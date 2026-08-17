import { describe, expect, it, vi } from "vitest";
import {
  createExpoPushTransport,
  EXPO_RECEIPTS_URL,
  EXPO_SEND_URL,
} from "../src/push/expo-transport";

describe("Expo push transport", () => {
  it("uses fixed Expo endpoints and optional access-token authorization", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ id: "ticket-1", status: "ok" }] }))
      .mockResolvedValueOnce(Response.json({ data: { "ticket-1": { status: "ok" } } }));
    const transport = createExpoPushTransport({ accessToken: "access-token", fetch });

    await transport.send([{
      body: "Body",
      data: {},
      sound: "default",
      title: "Title",
      to: "ExponentPushToken[test]",
    }]);
    await transport.getReceipts(["ticket-1"]);

    expect(fetch.mock.calls[0]?.[0]).toBe(EXPO_SEND_URL);
    expect(fetch.mock.calls[1]?.[0]).toBe(EXPO_RECEIPTS_URL);
    const sendHeaders = fetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(sendHeaders.get("authorization")).toBe("Bearer access-token");
  });

  it("rejects malformed or failed service responses", async () => {
    const malformedFetch = vi.fn(() => Promise.resolve(Response.json({ nope: true })));
    const failedFetch = vi.fn(() => Promise.resolve(new Response(null, { status: 503 })));

    await expect(createExpoPushTransport({ fetch: malformedFetch }).send([]))
      .rejects.toThrow("invalid ticket response");
    await expect(createExpoPushTransport({ fetch: failedFetch }).getReceipts([]))
      .rejects.toThrow("HTTP 503");
  });

  it("rejects requests above Expo's 100-item batch limit before fetching", async () => {
    const fetch = vi.fn();
    const transport = createExpoPushTransport({ fetch });
    const messages = Array.from({ length: 101 }, (_value, index) => ({
      body: "Body",
      data: {},
      sound: "default" as const,
      title: "Title",
      to: `ExponentPushToken[${index}]`,
    }));

    await expect(transport.send(messages)).rejects.toThrow("cannot exceed 100");
    await expect(transport.getReceipts(Array.from({ length: 101 }, (_value, index) => `${index}`)))
      .rejects.toThrow("cannot exceed 100");
    expect(fetch).not.toHaveBeenCalled();
  });
});
