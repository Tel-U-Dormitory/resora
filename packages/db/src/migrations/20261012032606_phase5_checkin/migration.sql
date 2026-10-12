CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"attendance_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"timing_class" text NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"manual_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scan_lat" double precision,
	"scan_lng" double precision,
	"gps_accuracy_m" double precision,
	CONSTRAINT "attendance_records_session_user_unique" UNIQUE("session_id","user_id"),
	CONSTRAINT "attendance_records_source" CHECK ("source" IN ('QR', 'MANUAL')),
	CONSTRAINT "attendance_records_timing" CHECK ("timing_class" IN ('EARLY', 'ON_TIME', 'LATE')),
	CONSTRAINT "attendance_records_manual_reason" CHECK ("source" <> 'MANUAL' OR ("manual_reason" IS NOT NULL AND length(btrim("manual_reason")) > 0)),
	CONSTRAINT "attendance_records_gps_package" CHECK (("source" = 'QR' AND "scan_lat" IS NOT NULL AND "scan_lng" IS NOT NULL AND "gps_accuracy_m" IS NOT NULL AND "scan_lat" BETWEEN -90 AND 90 AND "scan_lng" BETWEEN -180 AND 180 AND "gps_accuracy_m" > 0 AND "gps_accuracy_m" < 'Infinity'::double precision) OR ("source" = 'MANUAL' AND "scan_lat" IS NULL AND "scan_lng" IS NULL AND "gps_accuracy_m" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "attendance_records_user_time_idx" ON "attendance_records" ("user_id","attendance_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_user_id_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- Custom immutable-origin trigger is not represented in Drizzle snapshots.
-- Effective time/timing/reason/updated_at remain editable by future audited Phase 6 services.
CREATE FUNCTION public.guard_attendance_record_origin()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
     OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Original attendance creation time and source are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attendance_records_immutable_origin
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_record_origin();
