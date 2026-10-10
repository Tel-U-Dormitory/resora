CREATE TYPE "actor_type" AS ENUM('SR', 'MAHASISWA', 'ASUS', 'DITMAWA');--> statement-breakpoint
CREATE TYPE "system_privilege" AS ENUM('SUPERADMIN');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "buildings_code_nonblank" CHECK (length(btrim("code")) > 0),
	CONSTRAINT "buildings_name_nonblank" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"code" text PRIMARY KEY,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "departments_code_nonblank" CHECK (length(btrim("code")) > 0),
	CONSTRAINT "departments_name_nonblank" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"code" text PRIMARY KEY,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "positions_code_nonblank" CHECK (length(btrim("code")) > 0),
	CONSTRAINT "positions_name_nonblank" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sr_profiles" (
	"user_id" text PRIMARY KEY,
	"department_code" text NOT NULL,
	"position_code" text NOT NULL,
	"building_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_privileges" (
	"user_id" text,
	"privilege_code" "system_privilege",
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" text,
	CONSTRAINT "system_privileges_pkey" PRIMARY KEY("user_id","privilege_code")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY,
	"actor" "actor_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_key" UNIQUE("username");--> statement-breakpoint
CREATE INDEX "sr_profiles_department_idx" ON "sr_profiles" ("department_code");--> statement-breakpoint
CREATE INDEX "sr_profiles_position_idx" ON "sr_profiles" ("position_code");--> statement-breakpoint
CREATE INDEX "sr_profiles_building_idx" ON "sr_profiles" ("building_id");--> statement-breakpoint
CREATE INDEX "system_privileges_granted_by_idx" ON "system_privileges" ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "user_profiles_actor_active_idx" ON "user_profiles" ("actor","is_active");--> statement-breakpoint
ALTER TABLE "sr_profiles" ADD CONSTRAINT "sr_profiles_user_id_user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "sr_profiles" ADD CONSTRAINT "sr_profiles_department_code_departments_code_fkey" FOREIGN KEY ("department_code") REFERENCES "departments"("code");--> statement-breakpoint
ALTER TABLE "sr_profiles" ADD CONSTRAINT "sr_profiles_position_code_positions_code_fkey" FOREIGN KEY ("position_code") REFERENCES "positions"("code");--> statement-breakpoint
ALTER TABLE "sr_profiles" ADD CONSTRAINT "sr_profiles_building_id_buildings_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id");--> statement-breakpoint
ALTER TABLE "system_privileges" ADD CONSTRAINT "system_privileges_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "system_privileges" ADD CONSTRAINT "system_privileges_granted_by_user_id_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;