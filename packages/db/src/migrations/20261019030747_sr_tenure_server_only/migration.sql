ALTER TABLE "sr_period_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sr_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Better Auth/Express owns authorization; these are not Supabase client API tables.
REVOKE ALL ON TABLE public.sr_periods, public.sr_period_memberships FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.sr_periods, public.sr_period_memberships FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
