import { afterEach, describe, expect, it, vi } from "vitest";
import { startPushOutboxLoop } from "../src/push/outbox-loop";

const result = {
  dead: 0,
  delivered: 0,
  materialized: 0,
  receiptPending: 0,
  retried: 0,
  sent: 0,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("push outbox loop", () => {
  it("starts immediately, prevents overlapping passes, and drains on stop", async () => {
    vi.useFakeTimers();
    const first = Promise.withResolvers<typeof result>();
    const processOnce = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(result);
    const loop = startPushOutboxLoop({ intervalMs: 1000, processor: { processOnce } });

    expect(processOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(processOnce).toHaveBeenCalledTimes(1);

    first.resolve(result);
    await first.promise;
    await vi.advanceTimersByTimeAsync(1000);
    expect(processOnce).toHaveBeenCalledTimes(2);

    await loop.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(processOnce).toHaveBeenCalledTimes(2);
  });

  it("reports failures and continues on the next pass", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const processOnce = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(result);
    const loop = startPushOutboxLoop({ intervalMs: 1000, onError, processor: { processOnce } });

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: "database unavailable",
    }));
    expect(processOnce).toHaveBeenCalledTimes(2);
    await loop.stop();
  });
});
