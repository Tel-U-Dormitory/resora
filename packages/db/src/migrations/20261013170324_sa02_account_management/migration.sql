CREATE TABLE "account_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_audit_logs_action_check" CHECK ("action" = 'ACCOUNT_CREATED')
);
--> statement-breakpoint
CREATE INDEX "account_audit_logs_actor_created_idx" ON "account_audit_logs" ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "account_audit_logs_target_created_idx" ON "account_audit_logs" ("target_user_id","created_at");--> statement-breakpoint
ALTER TABLE "account_audit_logs" ADD CONSTRAINT "account_audit_logs_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "account_audit_logs" ADD CONSTRAINT "account_audit_logs_target_user_id_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- Durable account-creation evidence; no ordinary edit/delete/truncate path.
CREATE FUNCTION public.guard_account_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Account audit is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER account_audit_logs_mutation_guard
BEFORE UPDATE OR DELETE ON public.account_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_account_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER account_audit_logs_truncate_guard
BEFORE TRUNCATE ON public.account_audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_account_audit_mutation();
