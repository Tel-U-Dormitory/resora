CREATE TABLE "password_reset_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"target_email" text NOT NULL,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"request_ip" inet,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	CONSTRAINT "password_reset_audit_event" CHECK ("event_type" IN ('REQUESTED','SMTP_ACCEPTED','SMTP_FAILED','MANUAL_LINK_ISSUED','RESET_COMPLETED')),
	CONSTRAINT "password_reset_audit_source" CHECK ("source" IN ('PUBLIC','MANUAL')),
	CONSTRAINT "password_reset_audit_email" CHECK (length(btrim("target_email")) > 0),
	CONSTRAINT "password_reset_audit_error" CHECK ("error_code" IS NULL OR "error_code" IN ('SMTP_CONFIG','SMTP_AUTH','SMTP_CONNECT','SMTP_TLS','SMTP_SEND'))
);
--> statement-breakpoint
CREATE INDEX "password_reset_audit_user_created_idx" ON "password_reset_audit" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "password_reset_audit" ADD CONSTRAINT "password_reset_audit_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE public.password_reset_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TRIGGER password_reset_audit_mutation_guard
BEFORE UPDATE OR DELETE ON public.password_reset_audit
FOR EACH ROW EXECUTE FUNCTION public.guard_account_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER password_reset_audit_truncate_guard
BEFORE TRUNCATE ON public.password_reset_audit
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_account_audit_mutation();
