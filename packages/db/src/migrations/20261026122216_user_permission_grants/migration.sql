CREATE TABLE "user_permission_grants" (
	"user_id" text,
	"permission_code" text,
	"granted_by_user_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by_user_id" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY("user_id","permission_code"),
	CONSTRAINT "user_permission_grants_code_check" CHECK ("permission_code" IN ('ATTENDANCE_MANUAL_MANAGE')),
	CONSTRAINT "user_permission_grants_revocation_check" CHECK (("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL) OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND "revoked_at" >= "granted_at"))
);
--> statement-breakpoint
ALTER TABLE "user_permission_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "user_permission_grants_grantor_idx" ON "user_permission_grants" ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "user_permission_grants_revoker_idx" ON "user_permission_grants" ("revoked_by_user_id");--> statement-breakpoint
ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_granted_by_user_id_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_revoked_by_user_id_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "account_audit_logs" DROP CONSTRAINT "account_audit_logs_action_check", ADD CONSTRAINT "account_audit_logs_action_check" CHECK (("action" IN ('ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_ARCHIVED', 'PASSWORD_RESET', 'PERIOD_CREATED', 'PERIOD_EXTENDED', 'PERIOD_ASSIGNED', 'ACCOUNT_PERMISSION_GRANTED', 'ACCOUNT_PERMISSION_REVOKED') AND "actor_user_id" IS NOT NULL) OR ("action" = 'SYSTEM_ADMIN_BOOTSTRAPPED' AND "actor_user_id" IS NULL));
--> statement-breakpoint
REVOKE ALL ON TABLE public.user_permission_grants FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.user_permission_grants FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
