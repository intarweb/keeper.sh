UPDATE "calendar_accounts"
SET "accountId" = NULL
WHERE "accountId" = '';
--> statement-breakpoint
UPDATE "calendar_accounts" AS target
SET "accountId" = donor."accountId"
FROM "calendar_accounts" AS donor
WHERE target."accountId" IS NULL
  AND donor."accountId" IS NOT NULL
  AND donor."id" <> target."id"
  AND donor."userId" = target."userId"
  AND donor."provider" = target."provider"
  AND donor."email" IS NOT NULL
  AND donor."email" = target."email";
