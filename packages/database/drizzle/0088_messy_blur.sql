-- The auth tables, same reinterpretation as 0087. USING is load-bearing: without it
-- Postgres reads each naked timestamp in the session's TimeZone rather than as the UTC
-- the application wrote, and a session expiry would move by the offset.
ALTER TABLE "account" ALTER COLUMN "accessTokenExpiresAt" SET DATA TYPE timestamp with time zone USING "accessTokenExpiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refreshTokenExpiresAt" SET DATA TYPE timestamp with time zone USING "refreshTokenExpiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "revoked" SET DATA TYPE timestamp with time zone USING "revoked" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "authTime" SET DATA TYPE timestamp with time zone USING "authTime" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "passkey" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp with time zone USING "expiresAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updatedAt" SET DEFAULT now();