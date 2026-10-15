CREATE TABLE "event_deletion_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid NOT NULL UNIQUE,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"event_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_deletion_audits_action" CHECK ("action" = 'EVENT_DRAFT_DELETED'),
	CONSTRAINT "event_deletion_audits_reason" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "event_deletion_audits_snapshot" CHECK (jsonb_typeof("event_snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visibility" text DEFAULT 'VISIBLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_deletion_audits" ADD CONSTRAINT "event_deletion_audits_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_visibility" CHECK ("visibility" IN ('VISIBLE', 'HIDDEN', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_visibility_lifecycle" CHECK (("status" <> 'DRAFT' OR "visibility" = 'VISIBLE') AND ("visibility" <> 'ARCHIVED' OR "status" = 'CLOSED'));--> statement-breakpoint
ALTER TABLE "event_audit_logs" DROP CONSTRAINT "event_audit_logs_action", ADD CONSTRAINT "event_audit_logs_action" CHECK ("action" IN ('PUBLISHED_CONFIGURATION_EDITED', 'PUBLISHED_DETAILS_EDITED', 'CLOSED_METADATA_EDITED', 'EVENT_HIDDEN', 'EVENT_UNHIDDEN', 'EVENT_ARCHIVED', 'EVENT_RESTORED'));
--> statement-breakpoint
-- Reuse Part 1's append-only guard; the tombstone deliberately has no event FK.
CREATE TRIGGER event_deletion_audits_mutation_guard
BEFORE UPDATE OR DELETE ON public.event_deletion_audits
FOR EACH ROW EXECUTE FUNCTION public.guard_event_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER event_deletion_audits_truncate_guard
BEFORE TRUNCATE ON public.event_deletion_audits
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_event_audit_mutation();
