CREATE TABLE "device_installations" (
	"appVersion" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deviceName" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installationId" text NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"platform" text NOT NULL,
	"pushToken" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"invites" boolean DEFAULT true NOT NULL,
	"reauthentication" boolean DEFAULT true NOT NULL,
	"syncFailures" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notification_outbox" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deliveredAt" timestamp,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotencyKey" text,
	"lastError" text,
	"nextAttemptAt" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "push_notification_outbox_status_check" CHECK ("push_notification_outbox"."status" IN ('pending', 'processing', 'delivered', 'dead')),
	CONSTRAINT "push_notification_outbox_type_check" CHECK ("push_notification_outbox"."type" IN ('reauthentication_required', 'sync_failed', 'calendar_invite'))
);
--> statement-breakpoint
ALTER TABLE "device_installations" ADD CONSTRAINT "device_installations_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_outbox" ADD CONSTRAINT "push_notification_outbox_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_installations_user_installation_idx" ON "device_installations" USING btree ("userId","installationId");--> statement-breakpoint
CREATE UNIQUE INDEX "device_installations_push_token_idx" ON "device_installations" USING btree ("pushToken") WHERE "device_installations"."pushToken" is not null;--> statement-breakpoint
CREATE INDEX "device_installations_user_enabled_idx" ON "device_installations" USING btree ("userId","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_outbox_idempotency_idx" ON "push_notification_outbox" USING btree ("idempotencyKey") WHERE "push_notification_outbox"."idempotencyKey" is not null;--> statement-breakpoint
CREATE INDEX "push_notification_outbox_dispatch_idx" ON "push_notification_outbox" USING btree ("status","nextAttemptAt");--> statement-breakpoint
CREATE INDEX "push_notification_outbox_user_idx" ON "push_notification_outbox" USING btree ("userId");