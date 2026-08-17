CREATE TABLE "remote_ics_credentials" (
	"calendarId" uuid PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"encryptedPassword" text NOT NULL,
	"encryptedUsername" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "remote_ics_credentials" ADD CONSTRAINT "remote_ics_credentials_calendarId_calendars_id_fk" FOREIGN KEY ("calendarId") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;