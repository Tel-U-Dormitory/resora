CREATE TABLE "violations_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reporter_user_id" text NOT NULL,
	"temporary_object_key" text NOT NULL,
	"result_object_key" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "violations_upload_intents_consumption_consistent" CHECK (("consumed_at" IS NULL AND "result_object_key" IS NULL) OR ("consumed_at" IS NOT NULL AND "result_object_key" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "violations_upload_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "violations_upload_intents_temporary_key_idx" ON "violations_upload_intents" ("temporary_object_key");--> statement-breakpoint
CREATE INDEX "violations_upload_intents_reporter_expiry_idx" ON "violations_upload_intents" ("reporter_user_id","expires_at");--> statement-breakpoint
ALTER TABLE "violations_upload_intents" ADD CONSTRAINT "violations_upload_intents_reporter_user_id_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "user"("id");