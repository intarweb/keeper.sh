ALTER TABLE "event_mappings"
  ADD COLUMN IF NOT EXISTS "remoteContentHash" text,
  ADD COLUMN IF NOT EXISTS "remoteEchoAlgorithm" text,
  ADD COLUMN IF NOT EXISTS "remoteEchoAt" timestamp;
