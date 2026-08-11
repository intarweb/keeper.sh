import type { Plan } from "@keeper.sh/data-schemas";
import type { PushDestinationJob } from "./push-destination-jobs";
import { buildPushDestinationJobs } from "./push-destination-jobs";

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
export { runEnqueueDestinationSyncsForUsers };
export type { DestinationSyncQueue, EnqueueDestinationSyncDependencies };
