CREATE TABLE "committee_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"committee_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "committee_divisions_committee_id_id_key" UNIQUE("committee_id","id"),
	CONSTRAINT "committee_divisions_name_nonblank" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "committee_divisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "committee_members" (
	"committee_id" uuid,
	"user_id" text,
	"division_id" uuid NOT NULL,
	"position_code" text NOT NULL,
	CONSTRAINT "committee_members_pkey" PRIMARY KEY("committee_id","user_id"),
	CONSTRAINT "committee_members_position_code" CHECK ("position_code" IN ('ANGGOTA', 'SEKDEP', 'KADEP', 'SEKRE', 'BENDAHARA', 'PIC1', 'PIC2', 'PJ'))
);
--> statement-breakpoint
ALTER TABLE "committee_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committees_name_nonblank" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "committees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "committee_divisions_committee_name_idx" ON "committee_divisions" ("committee_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "committee_members_user_idx" ON "committee_members" ("user_id");--> statement-breakpoint
CREATE INDEX "committee_members_division_idx" ON "committee_members" ("committee_id","division_id");--> statement-breakpoint
CREATE INDEX "committees_created_by_idx" ON "committees" ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "committee_divisions" ADD CONSTRAINT "committee_divisions_committee_id_committees_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id");--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_committee_id_committees_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id");--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_user_id_sr_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sr_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_committee_division_fkey" FOREIGN KEY ("committee_id","division_id") REFERENCES "committee_divisions"("committee_id","id");--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- Server-only domain: revoke inherited Data API grants, including TRUNCATE.
REVOKE ALL ON TABLE public.committees, public.committee_divisions, public.committee_members FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.committees, public.committee_divisions, public.committee_members FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
