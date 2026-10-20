ALTER TABLE "password_reset_audit" ADD COLUMN "request_id" uuid;--> statement-breakpoint
CREATE INDEX "password_reset_audit_request_idx" ON "password_reset_audit" ("request_id");