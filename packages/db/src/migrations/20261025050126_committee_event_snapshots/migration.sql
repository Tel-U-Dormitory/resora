ALTER TABLE "event_participants" ADD COLUMN "snapshot_committee_division" text;--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "snapshot_committee_position" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organization_context" text DEFAULT 'SR' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "committee_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "snapshot_committee_name" text;--> statement-breakpoint
CREATE INDEX "events_committee_idx" ON "events" ("committee_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_committee_id_committees_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id");--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_committee_snapshot" CHECK (("snapshot_committee_division" IS NULL AND "snapshot_committee_position" IS NULL) OR ("snapshot_committee_division" IS NOT NULL AND length(btrim("snapshot_committee_division")) > 0 AND "snapshot_committee_position" IS NOT NULL AND "snapshot_committee_position" IN ('ANGGOTA', 'SEKDEP', 'KADEP', 'SEKRE', 'BENDAHARA', 'PIC1', 'PIC2', 'PJ')));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_context" CHECK (("organization_context" = 'SR' AND "committee_id" IS NULL AND "snapshot_committee_name" IS NULL) OR ("organization_context" = 'COMMITTEE' AND "committee_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_committee_snapshot" CHECK (("snapshot_committee_name" IS NULL OR length(btrim("snapshot_committee_name")) > 0) AND ("organization_context" <> 'COMMITTEE' OR "status" = 'DRAFT' OR "snapshot_committee_name" IS NOT NULL));