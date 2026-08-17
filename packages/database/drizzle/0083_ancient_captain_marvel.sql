CREATE TABLE "push_notification_deliveries" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deliveredAt" timestamp,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installationId" uuid NOT NULL,
	"lastError" text,
	"nextAttemptAt" timestamp DEFAULT now() NOT NULL,
	"notificationId" uuid NOT NULL,
	"receiptId" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_notification_deliveries_status_check" CHECK ("push_notification_deliveries"."status" IN ('pending', 'processing', 'receipt_pending', 'delivered', 'dead'))
);
--> statement-breakpoint
ALTER TABLE "push_notification_deliveries" ADD CONSTRAINT "push_notification_deliveries_installationId_device_installations_id_fk" FOREIGN KEY ("installationId") REFERENCES "public"."device_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_deliveries" ADD CONSTRAINT "push_notification_deliveries_notificationId_push_notification_outbox_id_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."push_notification_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_deliveries_notification_installation_idx" ON "push_notification_deliveries" USING btree ("notificationId","installationId");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_deliveries_receipt_idx" ON "push_notification_deliveries" USING btree ("receiptId") WHERE "push_notification_deliveries"."receiptId" is not null;--> statement-breakpoint
CREATE INDEX "push_notification_deliveries_dispatch_idx" ON "push_notification_deliveries" USING btree ("status","nextAttemptAt");