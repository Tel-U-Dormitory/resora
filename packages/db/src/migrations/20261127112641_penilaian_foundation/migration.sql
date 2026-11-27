CREATE TABLE "evaluation_attendance_fallbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"target_user_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"activity_title" text NOT NULL,
	"activity_date" date NOT NULL,
	"attendance_status" text NOT NULL,
	"max_points" double precision NOT NULL,
	"earned_points" double precision NOT NULL,
	"source_kind" text NOT NULL,
	"source_reference" text,
	"notes" text NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_attendance_fallbacks_type_valid" CHECK ("activity_type" IN ('RAPAT_ALL_PANITIA', 'EVENT_BESAR', 'EVENT_SEBAGIAN', 'SIDAK')),
	CONSTRAINT "evaluation_attendance_fallbacks_status_valid" CHECK ("attendance_status" IN ('HADIR_TEPAT_WAKTU', 'TERLAMBAT_DENGAN_IZIN', 'TERLAMBAT_TANPA_IZIN_MAX_15', 'TERLAMBAT_DENGAN_IZIN_LEBIH_15', 'TERLAMBAT_TANPA_IZIN_LEBIH_15', 'IZIN_DI_LUAR_5K', 'ALFA')),
	CONSTRAINT "evaluation_attendance_fallbacks_points_valid" CHECK ("max_points" > 0 AND "earned_points" >= 0 AND "earned_points" <= "max_points"),
	CONSTRAINT "evaluation_attendance_fallbacks_text_nonblank" CHECK (length(btrim("activity_title")) > 0 AND length(btrim("notes")) > 0)
);
--> statement-breakpoint
ALTER TABLE "evaluation_attendance_fallbacks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"target_user_id" text,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_audits_entity_valid" CHECK ("entity_type" IN ('PERIOD', 'PERIOD_EVENT', 'EVENT_SCORE', 'DEPARTMENT_SCORE', 'GFORM_IMPORT', 'ATTENDANCE_FALLBACK', 'POINT_TRANSACTION', 'FINALIZATION')),
	CONSTRAINT "evaluation_audits_nonblank" CHECK (length(btrim("action")) > 0 AND length(btrim("reason")) > 0),
	CONSTRAINT "evaluation_audits_state_object_valid" CHECK (("before_state" IS NULL OR jsonb_typeof("before_state") = 'object') AND ("after_state" IS NULL OR jsonb_typeof("after_state") = 'object'))
);
--> statement-breakpoint
ALTER TABLE "evaluation_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_department_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"quarter_number" integer DEFAULT 1 NOT NULL,
	"evaluator_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"target_department_code" text NOT NULL,
	"target_position_code" text NOT NULL,
	"commitment" double precision NOT NULL,
	"teamwork" double precision NOT NULL,
	"attitude" double precision NOT NULL,
	"contribution" double precision NOT NULL,
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_department_scores_no_self" CHECK ("evaluator_user_id" <> "target_user_id"),
	CONSTRAINT "evaluation_department_scores_quarter_valid" CHECK ("quarter_number" >= 1),
	CONSTRAINT "evaluation_department_scores_snapshot_nonblank" CHECK (length(btrim("target_department_code")) > 0 AND length(btrim("target_position_code")) > 0),
	CONSTRAINT "evaluation_department_scores_range" CHECK ("commitment" BETWEEN 0 AND 100 AND "teamwork" BETWEEN 0 AND 100 AND "attitude" BETWEEN 0 AND 100 AND "contribution" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "evaluation_department_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_event_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"period_event_id" uuid NOT NULL,
	"evaluator_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"commitment" double precision NOT NULL,
	"teamwork" double precision NOT NULL,
	"attitude" double precision NOT NULL,
	"contribution" double precision NOT NULL,
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_event_scores_no_self" CHECK ("evaluator_user_id" <> "target_user_id"),
	CONSTRAINT "evaluation_event_scores_range" CHECK ("commitment" BETWEEN 0 AND 100 AND "teamwork" BETWEEN 0 AND 100 AND "attitude" BETWEEN 0 AND 100 AND "contribution" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "evaluation_event_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_gform_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"source_reference" text NOT NULL,
	"respondent_key" text NOT NULL,
	"respondent_role" text NOT NULL,
	"target_user_id" text NOT NULL,
	"building_code" text,
	"answers" jsonb NOT NULL,
	"total_score" integer NOT NULL,
	"comment" text,
	"imported_by_user_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_gform_responses_source_valid" CHECK ("source_type" IN ('SR_MABA', 'EXTERNAL_ASUS_DITMAWA')),
	CONSTRAINT "evaluation_gform_responses_cycle_valid" CHECK ("cycle_number" >= 1),
	CONSTRAINT "evaluation_gform_responses_text_nonblank" CHECK (length(btrim("source_reference")) > 0 AND length(btrim("respondent_key")) > 0 AND length(btrim("respondent_role")) > 0),
	CONSTRAINT "evaluation_gform_responses_score_valid" CHECK (("source_type" = 'SR_MABA' AND "total_score" BETWEEN 20 AND 100 AND jsonb_array_length("answers") = 20) OR ("source_type" = 'EXTERNAL_ASUS_DITMAWA' AND "total_score" BETWEEN 10 AND 50 AND jsonb_array_length("answers") = 10))
);
--> statement-breakpoint
ALTER TABLE "evaluation_gform_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_period_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"category" text NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"configured_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_period_events_category_valid" CHECK ("category" IN ('ANNUAL', 'MONTHLY', 'WEEKLY'))
);
--> statement-breakpoint
ALTER TABLE "evaluation_period_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sr_period_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"schedules" jsonb NOT NULL,
	"sidak_max_points" double precision DEFAULT 10 NOT NULL,
	"performance_threshold" double precision,
	"created_by_user_id" text NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_periods_name_nonblank" CHECK (length(btrim("name")) > 0),
	CONSTRAINT "evaluation_periods_status_valid" CHECK ("status" IN ('OPEN', 'FINAL', 'REVISING')),
	CONSTRAINT "evaluation_periods_version_valid" CHECK ("version" > 0),
	CONSTRAINT "evaluation_periods_sidak_max_positive" CHECK ("sidak_max_points" > 0),
	CONSTRAINT "evaluation_periods_threshold_valid" CHECK ("performance_threshold" IS NULL OR "performance_threshold" >= 0),
	CONSTRAINT "evaluation_periods_finalized_consistent" CHECK (("status" = 'FINAL' AND "finalized_at" IS NOT NULL AND "finalized_by_user_id" IS NOT NULL) OR ("status" IN ('OPEN', 'REVISING') AND "finalized_at" IS NULL AND "finalized_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "evaluation_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"target_user_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"points" double precision NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"occurred_on" date NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"decided_by_user_id" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_point_transactions_type_valid" CHECK ("transaction_type" IN ('ADDITION', 'DEDUCTION')),
	CONSTRAINT "evaluation_point_transactions_points_positive" CHECK ("points" > 0),
	CONSTRAINT "evaluation_point_transactions_text_nonblank" CHECK (length(btrim("category")) > 0 AND length(btrim("reason")) > 0),
	CONSTRAINT "evaluation_point_transactions_status_consistent" CHECK (("status" = 'PENDING' AND "decided_by_user_id" IS NULL AND "decided_at" IS NULL) OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "evaluation_point_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_result_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"evaluation_period_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"target_user_id" text NOT NULL,
	"snapshot_nim" text NOT NULL,
	"snapshot_name" text NOT NULL,
	"snapshot_department_code" text NOT NULL,
	"snapshot_position_code" text NOT NULL,
	"snapshot_building_code" text NOT NULL,
	"snapshot_building_name" text NOT NULL,
	"annual_weighted" double precision NOT NULL,
	"monthly_weighted" double precision NOT NULL,
	"weekly_weighted" double precision NOT NULL,
	"department_weighted" double precision NOT NULL,
	"gform_weighted" double precision NOT NULL,
	"total_weighted_score" double precision NOT NULL,
	"attendance_points_total" double precision NOT NULL,
	"net_adjustment_points" double precision NOT NULL,
	"external_score_average" double precision,
	"component_breakdown" jsonb NOT NULL,
	"finalized_by_user_id" text NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_result_snapshots_version_valid" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "evaluation_result_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_attendance_fallbacks_dedup_idx" ON "evaluation_attendance_fallbacks" ("evaluation_period_id","target_user_id","activity_type","activity_date","activity_title");--> statement-breakpoint
CREATE INDEX "evaluation_attendance_fallbacks_period_target_idx" ON "evaluation_attendance_fallbacks" ("evaluation_period_id","target_user_id");--> statement-breakpoint
CREATE INDEX "evaluation_audits_period_time_idx" ON "evaluation_audits" ("evaluation_period_id","created_at");--> statement-breakpoint
CREATE INDEX "evaluation_audits_actor_time_idx" ON "evaluation_audits" ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_department_scores_unique_idx" ON "evaluation_department_scores" ("evaluation_period_id","quarter_number","evaluator_user_id","target_user_id");--> statement-breakpoint
CREATE INDEX "evaluation_department_scores_period_target_idx" ON "evaluation_department_scores" ("evaluation_period_id","target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_event_scores_unique_idx" ON "evaluation_event_scores" ("period_event_id","evaluator_user_id","target_user_id");--> statement-breakpoint
CREATE INDEX "evaluation_event_scores_period_target_idx" ON "evaluation_event_scores" ("evaluation_period_id","target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_gform_responses_dedup_idx" ON "evaluation_gform_responses" ("evaluation_period_id","source_type","cycle_number","respondent_key","target_user_id");--> statement-breakpoint
CREATE INDEX "evaluation_gform_responses_period_target_idx" ON "evaluation_gform_responses" ("evaluation_period_id","target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_period_events_period_event_idx" ON "evaluation_period_events" ("evaluation_period_id","event_id");--> statement-breakpoint
CREATE INDEX "evaluation_period_events_period_category_idx" ON "evaluation_period_events" ("evaluation_period_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_periods_name_idx" ON "evaluation_periods" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_periods_single_active_idx" ON "evaluation_periods" ("is_active") WHERE "is_active" = true;--> statement-breakpoint
CREATE INDEX "evaluation_periods_sr_period_idx" ON "evaluation_periods" ("sr_period_id");--> statement-breakpoint
CREATE INDEX "evaluation_point_transactions_period_target_idx" ON "evaluation_point_transactions" ("evaluation_period_id","target_user_id","status");--> statement-breakpoint
CREATE INDEX "evaluation_point_transactions_proposer_idx" ON "evaluation_point_transactions" ("proposed_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_result_snapshots_unique_idx" ON "evaluation_result_snapshots" ("evaluation_period_id","version","target_user_id");--> statement-breakpoint
CREATE INDEX "evaluation_result_snapshots_target_idx" ON "evaluation_result_snapshots" ("target_user_id","evaluation_period_id");--> statement-breakpoint
ALTER TABLE "evaluation_attendance_fallbacks" ADD CONSTRAINT "evaluation_attendance_fallbacks_EZ3x8iLLEQKz_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_attendance_fallbacks" ADD CONSTRAINT "evaluation_attendance_fallbacks_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_attendance_fallbacks" ADD CONSTRAINT "evaluation_attendance_fallbacks_g72YvW5EC56f_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_audits" ADD CONSTRAINT "evaluation_audits_WmoNBB9yxT2E_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_audits" ADD CONSTRAINT "evaluation_audits_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_audits" ADD CONSTRAINT "evaluation_audits_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_department_scores" ADD CONSTRAINT "evaluation_department_scores_MwwKw9yW1wty_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_department_scores" ADD CONSTRAINT "evaluation_department_scores_evaluator_user_id_user_id_fkey" FOREIGN KEY ("evaluator_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_department_scores" ADD CONSTRAINT "evaluation_department_scores_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_event_scores" ADD CONSTRAINT "evaluation_event_scores_VyL0T2pxABx4_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_event_scores" ADD CONSTRAINT "evaluation_event_scores_sq3QAj14G7kR_fkey" FOREIGN KEY ("period_event_id") REFERENCES "evaluation_period_events"("id");--> statement-breakpoint
ALTER TABLE "evaluation_event_scores" ADD CONSTRAINT "evaluation_event_scores_evaluator_user_id_user_id_fkey" FOREIGN KEY ("evaluator_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_event_scores" ADD CONSTRAINT "evaluation_event_scores_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_gform_responses" ADD CONSTRAINT "evaluation_gform_responses_rjnpaRRzrsOa_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_gform_responses" ADD CONSTRAINT "evaluation_gform_responses_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_gform_responses" ADD CONSTRAINT "evaluation_gform_responses_imported_by_user_id_user_id_fkey" FOREIGN KEY ("imported_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_period_events" ADD CONSTRAINT "evaluation_period_events_WbkHikQn8NeF_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_period_events" ADD CONSTRAINT "evaluation_period_events_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id");--> statement-breakpoint
ALTER TABLE "evaluation_period_events" ADD CONSTRAINT "evaluation_period_events_configured_by_user_id_user_id_fkey" FOREIGN KEY ("configured_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_sr_period_id_sr_periods_id_fkey" FOREIGN KEY ("sr_period_id") REFERENCES "sr_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_finalized_by_user_id_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_point_transactions" ADD CONSTRAINT "evaluation_point_transactions_VvSaAfqkbbOE_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_point_transactions" ADD CONSTRAINT "evaluation_point_transactions_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_point_transactions" ADD CONSTRAINT "evaluation_point_transactions_proposed_by_user_id_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_point_transactions" ADD CONSTRAINT "evaluation_point_transactions_decided_by_user_id_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_result_snapshots" ADD CONSTRAINT "evaluation_result_snapshots_vrROFUcwOFDl_fkey" FOREIGN KEY ("evaluation_period_id") REFERENCES "evaluation_periods"("id");--> statement-breakpoint
ALTER TABLE "evaluation_result_snapshots" ADD CONSTRAINT "evaluation_result_snapshots_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "evaluation_result_snapshots" ADD CONSTRAINT "evaluation_result_snapshots_finalized_by_user_id_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
CREATE FUNCTION public.guard_evaluation_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Penilaian audit is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER evaluation_audits_mutation_guard
BEFORE UPDATE OR DELETE ON public.evaluation_audits
FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER evaluation_audits_truncate_guard
BEFORE TRUNCATE ON public.evaluation_audits
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_evaluation_audit_mutation();