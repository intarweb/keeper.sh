import { describe, expect, it, vi } from "vitest";
import {
  runEnqueueDestinationSyncsForUsers,
  type DestinationSyncQueue,
} from "../../src/utils/enqueue-destination-syncs";

describe("runEnqueueDestinationSyncsForUsers", () => {
  it("enqueues affected Pro users immediately and leaves free users on their cadence", async () => {
    const addBulk = vi.fn<DestinationSyncQueue["addBulk"]>(() => Promise.resolve());
    const close = vi.fn<DestinationSyncQueue["close"]>(() => Promise.resolve());
    const getDestinations = vi.fn(() => Promise.resolve([
      { calendarId: "destination-free", userId: "free-user" },
      { calendarId: "destination-pro", userId: "pro-user" },
    ]));

    await expect(runEnqueueDestinationSyncsForUsers(
      ["pro-user", "free-user", "pro-user"],
      {
        createQueue: () => ({ addBulk, close }),
        enabled: true,
        generateCorrelationId: () => "correlation-1",
        getDestinations,
        resolvePlan: (userId) => {
          if (userId === "pro-user") {
            return Promise.resolve("pro");
          }
          return Promise.resolve("free");
        },
      },
    )).resolves.toBe(1);

    expect(getDestinations).toHaveBeenCalledWith(["free-user", "pro-user"]);
    expect(addBulk).toHaveBeenCalledOnce();
    const jobs = addBulk.mock.calls[0]?.[0];
    expect(jobs?.map((job) => job.data)).toEqual([
      {
        calendarId: "destination-pro",
        correlationId: "correlation-1",
        plan: "pro",
        userId: "pro-user",
      },
    ]);
    expect(jobs?.map((job) => job.opts.jobId)).toEqual([
      "sync-pro-user-destination-pro-correlation-1",
    ]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not query or create a queue when worker enqueuing is disabled", async () => {
    const createQueue = vi.fn();
    const getDestinations = vi.fn();

    await expect(runEnqueueDestinationSyncsForUsers(["user-1"], {
      createQueue,
      enabled: false,
      generateCorrelationId: () => "unused",
      getDestinations,
      resolvePlan: () => Promise.resolve("free"),
    })).resolves.toBe(0);

    expect(getDestinations).not.toHaveBeenCalled();
    expect(createQueue).not.toHaveBeenCalled();
  });

  it("drains durable requests and acknowledges them only after enqueue succeeds", async () => {
    const pendingRequests = [{ requestId: "request-1", userId: "pending-user" }];
    const acknowledgePendingRequests = vi.fn(() => Promise.resolve());
    const addBulk = vi.fn<DestinationSyncQueue["addBulk"]>(() => Promise.resolve());

    await expect(runEnqueueDestinationSyncsForUsers([], {
      acknowledgePendingRequests,
      createQueue: () => ({ addBulk, close: () => Promise.resolve() }),
      enabled: true,
      generateCorrelationId: () => "correlation-1",
      getDestinations: () => Promise.resolve([
        { calendarId: "destination-1", userId: "pending-user" },
      ]),
      getPendingRequests: () => Promise.resolve(pendingRequests),
      resolvePlan: () => Promise.resolve("free"),
    })).resolves.toBe(1);

    expect(acknowledgePendingRequests).toHaveBeenCalledWith(pendingRequests);
  });

  it("enqueues a durable request immediately for a free user", async () => {
    const addBulk = vi.fn<DestinationSyncQueue["addBulk"]>(() => Promise.resolve());

    await expect(runEnqueueDestinationSyncsForUsers([], {
      acknowledgePendingRequests: () => Promise.resolve(),
      createQueue: () => ({ addBulk, close: () => Promise.resolve() }),
      enabled: true,
      generateCorrelationId: () => "correlation-1",
      getDestinations: () => Promise.resolve([
        { calendarId: "destination-1", userId: "free-user" },
      ]),
      getPendingRequests: () => Promise.resolve([
        { requestId: "request-1", userId: "free-user" },
      ]),
      resolvePlan: () => Promise.resolve("free"),
    })).resolves.toBe(1);

    expect(addBulk).toHaveBeenCalledOnce();
  });

  it("retains durable requests when enqueue fails", async () => {
    const acknowledgePendingRequests = vi.fn(() => Promise.resolve());

    await expect(runEnqueueDestinationSyncsForUsers([], {
      acknowledgePendingRequests,
      createQueue: () => ({
        addBulk: () => Promise.reject(new Error("redis unavailable")),
        close: () => Promise.resolve(),
      }),
      enabled: true,
      generateCorrelationId: () => "correlation-1",
      getDestinations: () => Promise.resolve([
        { calendarId: "destination-1", userId: "pending-user" },
      ]),
      getPendingRequests: () => Promise.resolve([
        { requestId: "request-1", userId: "pending-user" },
      ]),
      resolvePlan: () => Promise.resolve("free"),
    })).rejects.toThrow("redis unavailable");

    expect(acknowledgePendingRequests).not.toHaveBeenCalled();
  });

  it("does not require a plan for a pending user with no destinations", async () => {
    const pendingRequests = [{ requestId: "request-1", userId: "deleted-user" }];
    const acknowledgePendingRequests = vi.fn(() => Promise.resolve());
    const resolvePlan = vi.fn((userId: string) => {
      if (userId === "active-user") {
        return Promise.resolve<"pro">("pro");
      }
      return Promise.resolve(null);
    });

    await expect(runEnqueueDestinationSyncsForUsers(["active-user"], {
      acknowledgePendingRequests,
      createQueue: () => ({
        addBulk: () => Promise.resolve(),
        close: () => Promise.resolve(),
      }),
      enabled: true,
      generateCorrelationId: () => "correlation-1",
      getDestinations: () => Promise.resolve([
        { calendarId: "destination-1", userId: "active-user" },
      ]),
      getPendingRequests: () => Promise.resolve(pendingRequests),
      resolvePlan,
    })).resolves.toBe(1);

    expect(resolvePlan).toHaveBeenCalledOnce();
    expect(resolvePlan).toHaveBeenCalledWith("active-user");
    expect(acknowledgePendingRequests).toHaveBeenCalledWith(pendingRequests);
  });
});
