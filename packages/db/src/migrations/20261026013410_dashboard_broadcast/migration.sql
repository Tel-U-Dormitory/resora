CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"content" text NOT NULL,
	"link_url" text,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text,
	"published_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcasts_title_valid" CHECK ("title" = btrim("title") AND char_length("title") BETWEEN 1 AND 150),
	CONSTRAINT "broadcasts_content_valid" CHECK ("content" = btrim("content") AND char_length("content") BETWEEN 1 AND 5000),
	CONSTRAINT "broadcasts_link_valid" CHECK ("link_url" IS NULL OR (char_length("link_url") <= 2048 AND "link_url" ~* '^https?://[^[:space:]]+$')),
	CONSTRAINT "broadcasts_expiry_valid" CHECK ("expires_at" > "published_at" AND "expires_at" <= "published_at" + interval '168 hours')
);
--> statement-breakpoint
ALTER TABLE "broadcasts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "broadcasts_published_idx" ON "broadcasts" ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "broadcasts_active_expiry_idx" ON "broadcasts" ("expires_at") WHERE "archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "broadcasts_creator_idx" ON "broadcasts" ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "broadcasts_editor_idx" ON "broadcasts" ("updated_by_user_id");--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_updated_by_user_id_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- Server-only, matching existing domain tables; no Supabase Data API grants.
REVOKE ALL ON TABLE public.broadcasts FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.broadcasts FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
