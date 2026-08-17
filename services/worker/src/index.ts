import { entry } from "entrykit";
import { Worker } from "bullmq";
import { PUSH_SYNC_QUEUE_NAME } from "@keeper.sh/queue";
import type { PushSyncJobPayload, PushSyncJobResult } from "@keeper.sh/queue";
import {
  closeDatabase,
  createMigrationReadinessDatabase,
  waitForDatabaseMigrations,
} from "@keeper.sh/database";
import { processJob } from "./processor";
import { createActiveDestinationJobs } from "./active-destination-jobs";
import { destroy } from "./utils/logging";
import env from "./env";
import { createExpoPushTransport } from "./push/expo-transport";
import { createPushOutboxProcessor } from "./push/outbox-processor";
import { createPushOutboxRepository } from "./push/outbox-repository";
import { startPushOutboxLoop } from "./push/outbox-loop";
import type { PushOutboxLoop } from "./push/outbox-loop";
import { context, widelog } from "./utils/logging";

const DEFAULT_CONCURRENCY = 25;
const LOCK_DURATION_MS = 360_000;
const STALLED_INTERVAL_MS = 30_000;
const MAX_STALLED_COUNT = 1;
const DEFAULT_PUSH_BATCH_SIZE = 50;
const DEFAULT_PUSH_INTERVAL_MS = 5000;

const parseConcurrency = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_CONCURRENCY;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_CONCURRENCY;
  }
  return parsed;
};

const positiveIntegerOrDefault = (value: number | undefined, fallback: number): number => {
  if (value === globalThis.undefined || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
};

await entry({
  main: async () => {
    const { database, shutdownConnections } = await import("./context");
    await waitForDatabaseMigrations(createMigrationReadinessDatabase(database));
    const concurrency = parseConcurrency(env.WORKER_CONCURRENCY);

    const { syncAggregateRuntime } = await import("./processor");

    let pushOutboxLoop: PushOutboxLoop | null = null;
    if (env.PUSH_OUTBOX_ENABLED !== false) {
      pushOutboxLoop = startPushOutboxLoop({
          intervalMs: positiveIntegerOrDefault(
            env.PUSH_OUTBOX_INTERVAL_MS,
            DEFAULT_PUSH_INTERVAL_MS,
          ),
          onError: (error) => {
            context(() => {
              widelog.set("operation.name", "push-outbox");
              widelog.set("operation.type", "job");
              widelog.set("outcome", "error");
              widelog.errorFields(error, { slug: "push-outbox-failed" });
              widelog.flush();
            });
          },
          processor: createPushOutboxProcessor({
            batchSize: positiveIntegerOrDefault(
              env.PUSH_OUTBOX_BATCH_SIZE,
              DEFAULT_PUSH_BATCH_SIZE,
            ),
            onEvent: (name, fields) => {
              context(() => {
                widelog.set("operation.name", name);
                widelog.set("operation.type", "job");
                for (const [key, value] of Object.entries(fields)) {
                  if (typeof value === "number") {
                    widelog.set(`push.${key}`, value);
                  }
                }
                widelog.set("outcome", "success");
                widelog.flush();
              });
            },
            repository: createPushOutboxRepository(database),
            transport: createExpoPushTransport({
              accessToken: env.EXPO_PUSH_ACCESS_TOKEN,
            }),
          }),
        });
    }

    const worker = new Worker<PushSyncJobPayload, PushSyncJobResult>(
      PUSH_SYNC_QUEUE_NAME,
      (job, token, signal) => processJob(job, token, signal),
      {
        connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
        concurrency,
        lockDuration: LOCK_DURATION_MS,
        stalledInterval: STALLED_INTERVAL_MS,
        maxStalledCount: MAX_STALLED_COUNT,
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 500 },
        metrics: { maxDataPoints: 1000 },
      },
    );

    const activeDestinationJobs = createActiveDestinationJobs({
      beginUserRun: (userId) => syncAggregateRuntime.beginSyncRun(userId),
      releaseUserRun: (userId) => {
        syncAggregateRuntime.releaseSyncing(userId);
      },
    });

    worker.on("active", (job) => {
      activeDestinationJobs.onActive({
        calendarId: job.data.calendarId,
        id: job.id ?? "",
        userId: job.data.userId,
      });
    });

    worker.on("completed", (job) => {
      activeDestinationJobs.onSettled({
        calendarId: job.data.calendarId,
        id: job.id ?? "",
        userId: job.data.userId,
      });
    });

    worker.on("failed", (job) => {
      if (job) {
        activeDestinationJobs.onSettled({
          calendarId: job.data.calendarId,
          id: job.id ?? "",
          userId: job.data.userId,
        });
      }
    });

    return async () => {
      activeDestinationJobs.close();
      await pushOutboxLoop?.stop();
      await worker.close();
      shutdownConnections();
      closeDatabase(database);
      await destroy();
    };
  },
  name: "worker",
});
