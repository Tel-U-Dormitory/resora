import { defineRelationsPart, sql } from "drizzle-orm";
import {
	bigint,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { buildings } from "./identity";

export const violationsReports = pgTable(
	"violations_reports",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		publicCode: text("public_code").notNull(),
		studentName: text("student_name").notNull(),
		studentNim: text("student_nim").notNull(),
		incidentDate: date("incident_date", { mode: "string" }).notNull(),
		description: text("description").notNull(),
		reporterUserId: text("reporter_user_id")
			.notNull()
			.references(() => user.id),
		recordedBuildingId: uuid("recorded_building_id")
			.notNull()
			.references(() => buildings.id),
		recordedBuildingName: text("recorded_building_name").notNull(),
		ktmObjectKey: text("ktm_object_key").notNull(),
		ktmContentType: text("ktm_content_type").notNull(),
		ktmSizeBytes: bigint("ktm_size_bytes", { mode: "number" }).notNull(),
		idempotencyKey: uuid("idempotency_key").notNull(),
		version: integer("version").notNull().default(1),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedByUserId: text("deleted_by_user_id").references(() => user.id),
		deleteReason: text("delete_reason"),
	},
	(t) => [
		check(
			"violations_reports_public_code_valid",
			sql`${t.publicCode} ~ '^PLG-[0-9A-HJKMNP-TV-Z]{10}$'`,
		),
		check(
			"violations_reports_required_text_nonblank",
			sql`length(btrim(${t.studentName})) > 0 AND length(btrim(${t.studentNim})) > 0 AND length(btrim(${t.description})) > 0 AND length(btrim(${t.recordedBuildingName})) > 0 AND length(btrim(${t.ktmObjectKey})) > 0 AND length(btrim(${t.ktmContentType})) > 0`,
		),
		check("violations_reports_ktm_size_valid", sql`${t.ktmSizeBytes} > 0`),
		check("violations_reports_version_valid", sql`${t.version} > 0`),
		check(
			"violations_reports_delete_metadata_consistent",
			sql`(${t.deletedAt} IS NULL AND ${t.deletedByUserId} IS NULL AND ${t.deleteReason} IS NULL) OR (${t.deletedAt} IS NOT NULL AND ${t.deletedByUserId} IS NOT NULL AND coalesce(length(btrim(${t.deleteReason})), 0) > 0)`,
		),
		uniqueIndex("violations_reports_public_code_idx").on(t.publicCode),
		uniqueIndex("violations_reports_reporter_idempotency_idx").on(
			t.reporterUserId,
			t.idempotencyKey,
		),
		uniqueIndex("violations_reports_ktm_object_key_idx").on(t.ktmObjectKey),
		index("violations_reports_building_date_idx").on(
			t.recordedBuildingId,
			t.incidentDate,
		),
		index("violations_reports_reporter_date_idx").on(
			t.reporterUserId,
			t.incidentDate,
		),
		index("violations_reports_active_date_idx")
			.on(t.incidentDate)
			.where(sql`${t.deletedAt} IS NULL`),
	],
).enableRLS();

export const violationsUploadIntents = pgTable(
	"violations_upload_intents",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reporterUserId: text("reporter_user_id")
			.notNull()
			.references(() => user.id),
		temporaryObjectKey: text("temporary_object_key").notNull(),
		contentType: text("content_type").notNull(),
		resultObjectKey: text("result_object_key"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		consumedAt: timestamp("consumed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("violations_upload_intents_temporary_key_idx").on(
			t.temporaryObjectKey,
		),
		index("violations_upload_intents_reporter_expiry_idx").on(
			t.reporterUserId,
			t.expiresAt,
		),
		check(
			"violations_upload_intents_consumption_consistent",
			sql`(${t.consumedAt} IS NULL AND ${t.resultObjectKey} IS NULL) OR (${t.consumedAt} IS NOT NULL AND ${t.resultObjectKey} IS NOT NULL)`,
		),
	],
).enableRLS();

export const violationsAudits = pgTable(
	"violations_audits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reportId: uuid("report_id")
			.notNull()
			.references(() => violationsReports.id),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action").notNull(),
		reason: text("reason"),
		beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
		afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			"violations_audits_action_valid",
			sql`${t.action} IN ('CREATED', 'UPDATED', 'DELETED')`,
		),
		check(
			"violations_audits_reason_valid",
			sql`${t.action} = 'CREATED' OR coalesce(length(btrim(${t.reason})), 0) > 0`,
		),
		check(
			"violations_audits_state_object_valid",
			sql`(${t.beforeState} IS NULL OR jsonb_typeof(${t.beforeState}) = 'object') AND (${t.afterState} IS NULL OR jsonb_typeof(${t.afterState}) = 'object')`,
		),
		index("violations_audits_report_time_idx").on(t.reportId, t.createdAt),
		index("violations_audits_actor_time_idx").on(t.actorUserId, t.createdAt),
	],
).enableRLS();

export const violationsRelations = defineRelationsPart(
	{ violationsReports, violationsAudits, user, buildings },
	(r) => ({
		violationsReports: {
			reporter: r.one.user({
				from: r.violationsReports.reporterUserId,
				to: r.user.id,
				optional: false,
			}),
			building: r.one.buildings({
				from: r.violationsReports.recordedBuildingId,
				to: r.buildings.id,
				optional: false,
			}),
			audits: r.many.violationsAudits({
				from: r.violationsReports.id,
				to: r.violationsAudits.reportId,
			}),
		},
		violationsAudits: {
			report: r.one.violationsReports({
				from: r.violationsAudits.reportId,
				to: r.violationsReports.id,
				optional: false,
			}),
			actor: r.one.user({
				from: r.violationsAudits.actorUserId,
				to: r.user.id,
				optional: false,
			}),
		},
	}),
);
