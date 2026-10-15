CREATE TABLE "event_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before_state" jsonb NOT NULL,
	"after_state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_audit_logs_reason" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "event_audit_logs_action" CHECK ("action" IN ('PUBLISHED_CONFIGURATION_EDITED', 'PUBLISHED_DETAILS_EDITED', 'CLOSED_METADATA_EDITED')),
	CONSTRAINT "event_audit_logs_states" CHECK (jsonb_typeof("before_state") = 'object' AND jsonb_typeof("after_state") = 'object')
);
--> statement-breakpoint
CREATE INDEX "event_audit_logs_event_time_idx" ON "event_audit_logs" ("event_id","created_at");--> statement-breakpoint
ALTER TABLE "event_audit_logs" ADD CONSTRAINT "event_audit_logs_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id");--> statement-breakpoint
ALTER TABLE "event_audit_logs" ADD CONSTRAINT "event_audit_logs_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- Administrative event evidence is append-only, including bulk mutations.
CREATE FUNCTION public.guard_event_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Event audit is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER event_audit_logs_mutation_guard
BEFORE UPDATE OR DELETE ON public.event_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_event_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER event_audit_logs_truncate_guard
BEFORE TRUNCATE ON public.event_audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_event_audit_mutation();
