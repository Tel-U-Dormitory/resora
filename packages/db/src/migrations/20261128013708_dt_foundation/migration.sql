ALTER TYPE "actor_type" ADD VALUE 'DT';--> statement-breakpoint
CREATE TABLE "dt_assignment_histories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"membership_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"department_code" text,
	"building_id" uuid,
	"work_program" text,
	"reason" text NOT NULL,
	"assigned_by_user_id" text NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dt_assignment_histories_reason_nonblank" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "dt_assignment_histories_window_valid" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);
--> statement-breakpoint
ALTER TABLE "dt_assignment_histories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dt_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"membership_id" uuid NOT NULL,
	"target_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dt_audits_action_valid" CHECK ("action" IN ('CANDIDATE_REGISTERED', 'MEMBERSHIP_ACTIVATED', 'MEMBERSHIP_REJECTED', 'PERIOD_EXTENDED', 'MEMBERSHIP_ENDED', 'MEMBERSHIP_ARCHIVED', 'ASSIGNMENT_UPDATED', 'PASSWORD_RESET')),
	CONSTRAINT "dt_audits_reason_nonblank" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "dt_audits_state_valid" CHECK (("before_state" IS NULL OR jsonb_typeof("before_state") = 'object') AND ("after_state" IS NULL OR jsonb_typeof("after_state") = 'object'))
);
--> statement-breakpoint
ALTER TABLE "dt_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dt_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"period_name" text NOT NULL,
	"status" text DEFAULT 'CANDIDATE' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"department_code" text,
	"building_id" uuid,
	"work_program" text,
	"registration_notes" text DEFAULT '' NOT NULL,
	"registered_by_user_id" text NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"ended_by_user_id" text,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	"archived_by_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dt_memberships_status_valid" CHECK ("status" IN ('CANDIDATE', 'ACTIVE', 'ENDED', 'REJECTED', 'ARCHIVED')),
	CONSTRAINT "dt_memberships_period_nonblank" CHECK (length(btrim("period_name")) > 0),
	CONSTRAINT "dt_memberships_dates_consistent" CHECK (("status" IN ('CANDIDATE', 'REJECTED') AND (("starts_on" IS NULL AND "ends_on" IS NULL) OR ("starts_on" IS NOT NULL AND "ends_on" IS NOT NULL AND "ends_on" >= "starts_on"))) OR ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED') AND "starts_on" IS NOT NULL AND "ends_on" IS NOT NULL AND "ends_on" >= "starts_on"))
);
--> statement-breakpoint
ALTER TABLE "dt_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "committee_members" DROP CONSTRAINT "committee_members_user_id_sr_profiles_user_id_fkey";--> statement-breakpoint
CREATE INDEX "dt_assignment_histories_membership_idx" ON "dt_assignment_histories" ("membership_id","effective_from");--> statement-breakpoint
CREATE INDEX "dt_assignment_histories_user_idx" ON "dt_assignment_histories" ("user_id","effective_from");--> statement-breakpoint
CREATE INDEX "dt_audits_membership_created_idx" ON "dt_audits" ("membership_id","created_at");--> statement-breakpoint
CREATE INDEX "dt_audits_target_created_idx" ON "dt_audits" ("target_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dt_memberships_single_active_user_idx" ON "dt_memberships" ("user_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "dt_memberships_single_candidate_user_idx" ON "dt_memberships" ("user_id") WHERE "status" = 'CANDIDATE';--> statement-breakpoint
CREATE INDEX "dt_memberships_status_idx" ON "dt_memberships" ("status");--> statement-breakpoint
CREATE INDEX "dt_memberships_user_created_idx" ON "dt_memberships" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "dt_memberships_dept_status_idx" ON "dt_memberships" ("department_code","status");--> statement-breakpoint
CREATE INDEX "dt_memberships_building_status_idx" ON "dt_memberships" ("building_id","status");--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_user_id_user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "dt_assignment_histories" ADD CONSTRAINT "dt_assignment_histories_membership_id_dt_memberships_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "dt_memberships"("id");--> statement-breakpoint
ALTER TABLE "dt_assignment_histories" ADD CONSTRAINT "dt_assignment_histories_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_assignment_histories" ADD CONSTRAINT "dt_assignment_histories_department_code_departments_code_fkey" FOREIGN KEY ("department_code") REFERENCES "departments"("code");--> statement-breakpoint
ALTER TABLE "dt_assignment_histories" ADD CONSTRAINT "dt_assignment_histories_building_id_buildings_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id");--> statement-breakpoint
ALTER TABLE "dt_assignment_histories" ADD CONSTRAINT "dt_assignment_histories_assigned_by_user_id_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_audits" ADD CONSTRAINT "dt_audits_membership_id_dt_memberships_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "dt_memberships"("id");--> statement-breakpoint
ALTER TABLE "dt_audits" ADD CONSTRAINT "dt_audits_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_audits" ADD CONSTRAINT "dt_audits_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_department_code_departments_code_fkey" FOREIGN KEY ("department_code") REFERENCES "departments"("code");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_building_id_buildings_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_registered_by_user_id_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_reviewed_by_user_id_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_ended_by_user_id_user_id_fkey" FOREIGN KEY ("ended_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "dt_memberships" ADD CONSTRAINT "dt_memberships_archived_by_user_id_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
CREATE FUNCTION public.guard_dt_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DT audit is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dt_audits_mutation_guard
BEFORE UPDATE OR DELETE ON public.dt_audits
FOR EACH ROW EXECUTE FUNCTION public.guard_dt_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER dt_audits_truncate_guard
BEFORE TRUNCATE ON public.dt_audits
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_dt_audit_mutation();
