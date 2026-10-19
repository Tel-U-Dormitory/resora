CREATE TABLE "sr_period_memberships" (
	"user_id" text,
	"period_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sr_period_memberships_pkey" PRIMARY KEY("user_id","period_id")
);
--> statement-breakpoint
CREATE TABLE "sr_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sr_periods_name_nonblank" CHECK (length(btrim("name")) > 0),
	CONSTRAINT "sr_periods_date_order" CHECK ("ends_on" >= "starts_on")
);
--> statement-breakpoint
ALTER TABLE "account_audit_logs" ADD COLUMN "details" jsonb;--> statement-breakpoint
CREATE INDEX "sr_period_memberships_period_idx" ON "sr_period_memberships" ("period_id");--> statement-breakpoint
ALTER TABLE "sr_period_memberships" ADD CONSTRAINT "sr_period_memberships_user_id_sr_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sr_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "sr_period_memberships" ADD CONSTRAINT "sr_period_memberships_period_id_sr_periods_id_fkey" FOREIGN KEY ("period_id") REFERENCES "sr_periods"("id");--> statement-breakpoint
ALTER TABLE "account_audit_logs" DROP CONSTRAINT "account_audit_logs_action_check", ADD CONSTRAINT "account_audit_logs_action_check" CHECK (("action" IN ('ACCOUNT_CREATED', 'PASSWORD_RESET', 'PERIOD_CREATED', 'PERIOD_EXTENDED', 'PERIOD_ASSIGNED') AND "actor_user_id" IS NOT NULL) OR ("action" = 'SYSTEM_ADMIN_BOOTSTRAPPED' AND "actor_user_id" IS NULL));