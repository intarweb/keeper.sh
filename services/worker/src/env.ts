import arkenv from "arkenv";

const schema = {
  DATABASE_URL: "string.url",
  ENCRYPTION_KEY: "string?",
  EXPO_PUSH_ACCESS_TOKEN: "string?",
  GOOGLE_CLIENT_ID: "string?",
  GOOGLE_CLIENT_SECRET: "string?",
  MICROSOFT_CLIENT_ID: "string?",
  MICROSOFT_CLIENT_SECRET: "string?",
  REDIS_URL: "string.url",
  PUSH_OUTBOX_BATCH_SIZE: "number?",
  PUSH_OUTBOX_ENABLED: "boolean?",
  PUSH_OUTBOX_INTERVAL_MS: "number?",
  WORKER_CONCURRENCY: "string?",
} as const;

export { schema };
export default arkenv(schema);
