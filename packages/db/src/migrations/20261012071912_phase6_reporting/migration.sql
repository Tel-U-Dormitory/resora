CREATE TABLE "attendance_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"attendance_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_audit_logs_reason" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "attendance_audit_logs_action_state" CHECK (("action" = 'MANUAL_CREATED' AND "before_state" IS NULL) OR ("action" = 'ATTENDANCE_CORRECTED' AND "before_state" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "attendance_audit_logs_attendance_time_idx" ON "attendance_audit_logs" ("attendance_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_audit_logs_session_time_idx" ON "attendance_audit_logs" ("session_id","created_at");--> statement-breakpoint
ALTER TABLE "attendance_audit_logs" ADD CONSTRAINT "attendance_audit_logs_attendance_id_attendance_records_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance_records"("id");--> statement-breakpoint
ALTER TABLE "attendance_audit_logs" ADD CONSTRAINT "attendance_audit_logs_session_id_attendance_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id");--> statement-breakpoint
ALTER TABLE "attendance_audit_logs" ADD CONSTRAINT "attendance_audit_logs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "attendance_audit_logs" ADD CONSTRAINT "attendance_audit_logs_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- Custom integrity functions/triggers are not represented in Drizzle snapshots.
-- Extend Phase 5's guard in this additive migration; applied files remain unchanged.
CREATE OR REPLACE FUNCTION public.guard_attendance_record_origin()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
     OR NEW.manual_reason IS DISTINCT FROM OLD.manual_reason
     OR NEW.scan_lat IS DISTINCT FROM OLD.scan_lat
     OR NEW.scan_lng IS DISTINCT FROM OLD.scan_lng
     OR NEW.gps_accuracy_m IS DISTINCT FROM OLD.gps_accuracy_m THEN
    RAISE EXCEPTION 'Attendance origin and binding are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_attendance_audit_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Attendance audit is append-only' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER attendance_audit_logs_append_only
BEFORE UPDATE OR DELETE ON public.attendance_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_audit_append_only();
--> statement-breakpoint
CREATE TRIGGER attendance_audit_logs_no_truncate
BEFORE TRUNCATE ON public.attendance_audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_attendance_audit_append_only();
--> statement-breakpoint
CREATE FUNCTION public.guard_attendance_audit_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  original public.attendance_records%ROWTYPE;
  state jsonb;
BEGIN
  SELECT * INTO original FROM public.attendance_records WHERE id = NEW.attendance_id FOR SHARE;
	IF NOT (NEW.reason ~ '[^[:space:]]') THEN
		RAISE EXCEPTION 'Audit reason must not be blank' USING ERRCODE = '23514';
	END IF;
  IF NOT FOUND OR original.session_id IS DISTINCT FROM NEW.session_id
     OR original.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Audit attendance binding mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.action = 'MANUAL_CREATED' AND original.source <> 'MANUAL' THEN
    RAISE EXCEPTION 'Manual creation audit requires a manual record' USING ERRCODE = '23514';
  END IF;
  FOREACH state IN ARRAY ARRAY[NEW.before_state, NEW.after_state] LOOP
    IF state IS NOT NULL AND NOT COALESCE(
        jsonb_typeof(state) = 'object'
        AND state ?& ARRAY['attendanceAt', 'timingClass']
        AND (state - 'attendanceAt' - 'timingClass') = '{}'::jsonb
        AND jsonb_typeof(state->'attendanceAt') = 'string'
        AND jsonb_typeof(state->'timingClass') = 'string'
        AND state->>'timingClass' IN ('EARLY', 'ON_TIME', 'LATE'), false) THEN
      RAISE EXCEPTION 'Audit state contains invalid or unapproved fields' USING ERRCODE = '23514';
    END IF;
    IF state IS NOT NULL THEN
      -- Parse both timestamps, rejecting malformed before/after values.
      PERFORM (state->>'attendanceAt')::timestamptz;
    END IF;
  END LOOP;
  IF (NEW.after_state->>'attendanceAt')::timestamptz IS DISTINCT FROM original.attendance_at
     OR NEW.after_state->>'timingClass' IS DISTINCT FROM original.timing_class THEN
    RAISE EXCEPTION 'Audit after state mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attendance_audit_logs_binding
BEFORE INSERT ON public.attendance_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_audit_binding();
