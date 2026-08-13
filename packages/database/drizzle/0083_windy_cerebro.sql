ALTER TABLE "event_mappings"
  ADD COLUMN IF NOT EXISTS "remoteRejectedContentHash" text;
