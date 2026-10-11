CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"internal_event_id" uuid NOT NULL UNIQUE,
	"status" text DEFAULT 'INACTIVE' NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"geofence_radius_m" integer DEFAULT 20 NOT NULL,
	"late_grace_minutes" integer DEFAULT 15 NOT NULL,
	"qr_ttl_minutes" integer DEFAULT 360 NOT NULL,
	"activated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "attendance_sessions_coordinates" CHECK ("center_lat" BETWEEN -90 AND 90 AND "center_lng" BETWEEN -180 AND 180),
	CONSTRAINT "attendance_sessions_policy" CHECK ("geofence_radius_m" > 0 AND "late_grace_minutes" >= 0 AND "qr_ttl_minutes" > 0),
	CONSTRAINT "attendance_sessions_lifecycle" CHECK (("status" = 'INACTIVE' AND "activated_at" IS NULL AND "closed_at" IS NULL) OR ("status" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "closed_at" IS NULL) OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"event_id" uuid,
	"user_id" text,
	"snapshot_nim" text NOT NULL,
	"snapshot_name" text NOT NULL,
	"snapshot_department" text NOT NULL,
	"snapshot_position" text NOT NULL,
	"snapshot_building_code" text NOT NULL,
	"snapshot_building_name" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_pkey" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"roster_criteria" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_title_nonblank" CHECK (length(btrim("title")) > 0),
	CONSTRAINT "events_schedule_order" CHECK ("ends_at" > "starts_at"),
	CONSTRAINT "events_lifecycle" CHECK (("status" = 'DRAFT' AND "published_at" IS NULL AND "closed_at" IS NULL) OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "closed_at" IS NULL) OR ("status" = 'CLOSED' AND "published_at" IS NOT NULL AND "closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "qr_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"is_current" boolean DEFAULT true NOT NULL,
	"issued_by_user_id" text NOT NULL,
	CONSTRAINT "qr_challenges_expiry" CHECK ("expires_at" > "activated_at")
);
--> statement-breakpoint
CREATE INDEX "event_participants_user_event_idx" ON "event_participants" ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "events_status_start_idx" ON "events" ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_challenges_current_session_idx" ON "qr_challenges" ("session_id") WHERE "is_current" = true;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_internal_event_id_events_id_fkey" FOREIGN KEY ("internal_event_id") REFERENCES "events"("id");--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id");--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "qr_challenges" ADD CONSTRAINT "qr_challenges_session_id_attendance_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id");--> statement-breakpoint
ALTER TABLE "qr_challenges" ADD CONSTRAINT "qr_challenges_issued_by_user_id_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "user"("id");
--> statement-breakpoint
-- UNIQUE/FK gives at most one session. Deferred inverse checks require exactly
-- one at commit while allowing atomic event+session creation and scratch cleanup.
-- Drizzle snapshots do not represent these custom cross-table triggers.
CREATE FUNCTION public.check_internal_event_session()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE event_ids uuid[]; event_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    IF TG_OP = 'INSERT' THEN event_ids := ARRAY[NEW.id];
    ELSE event_ids := ARRAY[OLD.id, NEW.id]; END IF;
  ELSIF TG_OP = 'INSERT' THEN event_ids := ARRAY[NEW.internal_event_id];
  ELSIF TG_OP = 'DELETE' THEN event_ids := ARRAY[OLD.internal_event_id];
  ELSE event_ids := ARRAY[OLD.internal_event_id, NEW.internal_event_id]; END IF;
  FOREACH event_id IN ARRAY event_ids LOOP
    IF event_id IS NULL THEN CONTINUE; END IF;
    PERFORM 1 FROM public.events WHERE id = event_id FOR UPDATE;
    IF FOUND AND (SELECT count(*) FROM public.attendance_sessions WHERE internal_event_id = event_id) <> 1 THEN
      RAISE EXCEPTION 'Internal event requires exactly one attendance session' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER events_require_session
AFTER INSERT OR UPDATE ON public.events DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_internal_event_session();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER attendance_sessions_event_consistency
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_sessions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_internal_event_session();
--> statement-breakpoint
CREATE FUNCTION public.guard_internal_session_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.internal_event_id IS DISTINCT FROM OLD.internal_event_id THEN
    RAISE EXCEPTION 'Attendance session binding is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attendance_sessions_immutable_binding
BEFORE UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_internal_session_binding();
