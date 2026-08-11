import { createPushSyncQueue } from "@keeper.sh/queue";
import type { Plan } from "@keeper.sh/data-schemas";
import {
  calendarsTable,
  userSyncRequestsTable,
} from "@keeper.sh/database/schema";
import { and, arrayContains, eq, inArray } from "drizzle-orm";
import env from "@/env";
import { buildPushDestinationJobs } from "./push-destination-jobs";
import type { PushDestinationJob } from "./push-destination-jobs";

interface DestinationSyncQueue {
  addBulk: (jobs: PushDestinationJob[]) => Promise<unknown>;
  close: () => Promise<void>;
}

interface EnqueueDestinationSyncDependencies {
  acknowledgePendingRequests?: (
    requests: { requestId: string; userId: string }[],
  ) => Promise<void>;
  createQueue: () => DestinationSyncQueue;
  enabled: boolean;
  generateCorrelationId: () => string;
  getDestinations: (userIds: string[]) => Promise<{ calendarId: string; userId: string }[]>;
  getPendingRequests?: () => Promise<{ requestId: string; userId: string }[]>;
  resolvePlan: (userId: string) => Promise<Plan | null>;
}

const runEnqueueDestinationSyncsForUsers = async (
  candidateUserIds: Iterable<string>,
  dependencies: EnqueueDestinationSyncDependencies,
): Promise<number> => {
  if (!dependencies.enabled) {
    return 0;
  }

  const pendingRequests = await dependencies.getPendingRequests?.() ?? [];
  const userIds = [...new Set([
    ...candidateUserIds,
    ...pendingRequests.map(({ userId }) => userId),
  ])].toSorted();
  if (userIds.length === 0) {
    return 0;
  }

  const destinations = await dependencies.getDestinations(userIds);
  if (destinations.length === 0) {
    await dependencies.acknowledgePendingRequests?.(pendingRequests);
    return 0;
  }

  const plansByUserId = new Map<string, Plan>();
  const destinationUserIds = [...new Set(
    destinations.map(({ userId }) => userId),
  )];
  await Promise.all(destinationUserIds.map(async (userId) => {
    const plan = await dependencies.resolvePlan(userId);
    if (!plan) {
      throw new Error(`Unable to resolve user plan for ingestion sync enqueue: ${userId}`);
    }
    plansByUserId.set(userId, plan);
  }));

  const pendingUserIds = new Set(
    pendingRequests.map(({ userId }) => userId),
  );
  const eligibleDestinations = destinations.filter(({ userId }) =>
    pendingUserIds.has(userId) || plansByUserId.get(userId) === "pro");

  const correlationId = dependencies.generateCorrelationId();
  const jobs = (["free", "pro"] as const).flatMap((plan) =>
    buildPushDestinationJobs(
      eligibleDestinations.filter(
        (destination) => plansByUserId.get(destination.userId) === plan,
      ),
      plan,
      correlationId,
      { correlatedJobIds: true },
    ));
  if (jobs.length === 0) {
    await dependencies.acknowledgePendingRequests?.(pendingRequests);
    return 0;
  }

  const queue = dependencies.createQueue();
  try {
    await queue.addBulk(jobs);
  } finally {
    await queue.close();
  }
  await dependencies.acknowledgePendingRequests?.(pendingRequests);
  return jobs.length;
};

const enqueueDestinationSyncsForUsers = async (
  candidateUserIds: Iterable<string>,
): Promise<number> => {
  const { database, premiumService } = await import("@/context");
  return runEnqueueDestinationSyncsForUsers(candidateUserIds, {
    acknowledgePendingRequests: async (requests) => {
      if (requests.length === 0) {
        return;
      }
      await database.transaction(async (transaction) => {
        for (const request of requests) {
          await transaction
            .delete(userSyncRequestsTable)
            .where(and(
              eq(userSyncRequestsTable.userId, request.userId),
              eq(userSyncRequestsTable.requestId, request.requestId),
            ));
        }
      });
    },
    createQueue: () => createPushSyncQueue({ url: env.REDIS_URL, maxRetriesPerRequest: null }),
    enabled: env.WORKER_JOB_QUEUE_ENABLED !== false,
    generateCorrelationId: () => crypto.randomUUID(),
    getDestinations: (userIds) => database
      .select({
        calendarId: calendarsTable.id,
        userId: calendarsTable.userId,
      })
      .from(calendarsTable)
      .where(and(
        arrayContains(calendarsTable.capabilities, ["push"]),
        eq(calendarsTable.disabled, false),
        inArray(calendarsTable.userId, userIds),
      )),
    getPendingRequests: () => database
      .select({
        requestId: userSyncRequestsTable.requestId,
        userId: userSyncRequestsTable.userId,
      })
      .from(userSyncRequestsTable),
    resolvePlan: (userId) => premiumService.getUserPlan(userId),
  });
};

export {
  enqueueDestinationSyncsForUsers,
  runEnqueueDestinationSyncsForUsers,
};
export type {
  DestinationSyncQueue,
  EnqueueDestinationSyncDependencies,
};
