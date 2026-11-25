CREATE TABLE "violations_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"report_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "violations_audits_action_valid" CHECK ("action" IN ('CREATED', 'UPDATED', 'DELETED')),
	CONSTRAINT "violations_audits_reason_valid" CHECK ("action" = 'CREATED' OR coalesce(length(btrim("reason")), 0) > 0),
	CONSTRAINT "violations_audits_state_object_valid" CHECK (("before_state" IS NULL OR jsonb_typeof("before_state") = 'object') AND ("after_state" IS NULL OR jsonb_typeof("after_state") = 'object'))
);
--> statement-breakpoint
ALTER TABLE "violations_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "violations_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"public_code" text NOT NULL,
	"student_name" text NOT NULL,
	"student_nim" text NOT NULL,
	"incident_date" date NOT NULL,
	"description" text NOT NULL,
	"reporter_user_id" text NOT NULL,
	"recorded_building_id" uuid NOT NULL,
	"recorded_building_name" text NOT NULL,
	"ktm_object_key" text NOT NULL,
	"ktm_content_type" text NOT NULL,
	"ktm_size_bytes" bigint NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" text,
	"delete_reason" text,
	CONSTRAINT "violations_reports_public_code_valid" CHECK ("public_code" ~ '^PLG-[0-9A-HJKMNP-TV-Z]{10}$'),
	CONSTRAINT "violations_reports_required_text_nonblank" CHECK (length(btrim("student_name")) > 0 AND length(btrim("student_nim")) > 0 AND length(btrim("description")) > 0 AND length(btrim("recorded_building_name")) > 0 AND length(btrim("ktm_object_key")) > 0 AND length(btrim("ktm_content_type")) > 0),
	CONSTRAINT "violations_reports_ktm_size_valid" CHECK ("ktm_size_bytes" > 0),
	CONSTRAINT "violations_reports_version_valid" CHECK ("version" > 0),
	CONSTRAINT "violations_reports_delete_metadata_consistent" CHECK (("deleted_at" IS NULL AND "deleted_by_user_id" IS NULL AND "delete_reason" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by_user_id" IS NOT NULL AND coalesce(length(btrim("delete_reason")), 0) > 0))
);
--> statement-breakpoint
ALTER TABLE "violations_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "violations_audits_report_time_idx" ON "violations_audits" ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "violations_audits_actor_time_idx" ON "violations_audits" ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "violations_reports_public_code_idx" ON "violations_reports" ("public_code");--> statement-breakpoint
CREATE UNIQUE INDEX "violations_reports_reporter_idempotency_idx" ON "violations_reports" ("reporter_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "violations_reports_ktm_object_key_idx" ON "violations_reports" ("ktm_object_key");--> statement-breakpoint
CREATE INDEX "violations_reports_building_date_idx" ON "violations_reports" ("recorded_building_id","incident_date");--> statement-breakpoint
CREATE INDEX "violations_reports_reporter_date_idx" ON "violations_reports" ("reporter_user_id","incident_date");--> statement-breakpoint
CREATE INDEX "violations_reports_active_date_idx" ON "violations_reports" ("incident_date") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "violations_audits" ADD CONSTRAINT "violations_audits_report_id_violations_reports_id_fkey" FOREIGN KEY ("report_id") REFERENCES "violations_reports"("id");--> statement-breakpoint
ALTER TABLE "violations_audits" ADD CONSTRAINT "violations_audits_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "violations_reports" ADD CONSTRAINT "violations_reports_reporter_user_id_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "violations_reports" ADD CONSTRAINT "violations_reports_recorded_building_id_buildings_id_fkey" FOREIGN KEY ("recorded_building_id") REFERENCES "buildings"("id");--> statement-breakpoint
ALTER TABLE "violations_reports" ADD CONSTRAINT "violations_reports_deleted_by_user_id_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
CREATE FUNCTION public.guard_violations_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pelanggaran audit is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER violations_audits_mutation_guard
BEFORE UPDATE OR DELETE ON public.violations_audits
FOR EACH ROW EXECUTE FUNCTION public.guard_violations_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER violations_audits_truncate_guard
BEFORE TRUNCATE ON public.violations_audits
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_violations_audit_mutation();
