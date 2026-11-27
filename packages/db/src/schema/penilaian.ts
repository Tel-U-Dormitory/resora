import { defineRelationsPart, sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { events } from "./attendance";
import { user } from "./auth";
import { srPeriods } from "./identity";

export type EvaluationScheduleWindow = {
	startsOn: string | null;
	endsOn: string | null;
	cadenceNote: string | null;
};

export type EvaluationPeriodSchedules = {
	annualEvent: EvaluationScheduleWindow;
	monthlyEvent: EvaluationScheduleWindow;
	weeklyEvent: EvaluationScheduleWindow;
	department: EvaluationScheduleWindow;
	gform: EvaluationScheduleWindow;
	external: EvaluationScheduleWindow;
};

export type EvaluationPeriodStatus = "OPEN" | "FINAL" | "REVISING";
export type EvaluationEventCategory = "ANNUAL" | "MONTHLY" | "WEEKLY";
export type EvaluationGformSourceType = "SR_MABA" | "EXTERNAL_ASUS_DITMAWA";
export type EvaluationAttendanceActivityType =
	| "RAPAT_ALL_PANITIA"
	| "EVENT_BESAR"
	| "EVENT_SEBAGIAN"
	| "SIDAK";
export type EvaluationAttendanceStatus =
	| "HADIR_TEPAT_WAKTU"
	| "TERLAMBAT_DENGAN_IZIN"
	| "TERLAMBAT_TANPA_IZIN_MAX_15"
	| "TERLAMBAT_DENGAN_IZIN_LEBIH_15"
	| "TERLAMBAT_TANPA_IZIN_LEBIH_15"
	| "IZIN_DI_LUAR_5K"
	| "ALFA";
export type EvaluationPointTransactionType = "ADDITION" | "DEDUCTION";
export type EvaluationPointTransactionStatus =
	| "PENDING"
	| "APPROVED"
	| "REJECTED";

export const evaluationPeriods = pgTable(
	"evaluation_periods",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		srPeriodId: uuid("sr_period_id")
			.notNull()
			.references(() => srPeriods.id),
		name: text("name").notNull(),
		status: text("status")
			.$type<EvaluationPeriodStatus>()
			.notNull()
			.default("OPEN"),
		version: integer("version").notNull().default(1),
		isActive: boolean("is_active").notNull().default(false),
		schedules: jsonb("schedules").$type<EvaluationPeriodSchedules>().notNull(),
		sidakMaxPoints: doublePrecision("sidak_max_points").notNull().default(10),
		// Null until HCO configures an official performance threshold (FR-EVAL-028 / D08).
		performanceThreshold: doublePrecision("performance_threshold"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		finalizedAt: timestamp("finalized_at", { withTimezone: true }),
		finalizedByUserId: text("finalized_by_user_id").references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_periods_name_nonblank",
			sql`length(btrim(${t.name})) > 0`,
		),
		check(
			"evaluation_periods_status_valid",
			sql`${t.status} IN ('OPEN', 'FINAL', 'REVISING')`,
		),
		check("evaluation_periods_version_valid", sql`${t.version} > 0`),
		check(
			"evaluation_periods_sidak_max_positive",
			sql`${t.sidakMaxPoints} > 0`,
		),
		check(
			"evaluation_periods_threshold_valid",
			sql`${t.performanceThreshold} IS NULL OR ${t.performanceThreshold} >= 0`,
		),
		check(
			"evaluation_periods_finalized_consistent",
			sql`(${t.status} = 'FINAL' AND ${t.finalizedAt} IS NOT NULL AND ${t.finalizedByUserId} IS NOT NULL) OR (${t.status} IN ('OPEN', 'REVISING') AND ${t.finalizedAt} IS NULL AND ${t.finalizedByUserId} IS NULL)`,
		),
		uniqueIndex("evaluation_periods_name_idx").on(t.name),
		uniqueIndex("evaluation_periods_single_active_idx")
			.on(t.isActive)
			.where(sql`${t.isActive} = true`),
		index("evaluation_periods_sr_period_idx").on(t.srPeriodId),
	],
).enableRLS();

export const evaluationPeriodEvents = pgTable(
	"evaluation_period_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		eventId: uuid("event_id")
			.notNull()
			.references(() => events.id),
		category: text("category").$type<EvaluationEventCategory>().notNull(),
		isMandatory: boolean("is_mandatory").notNull().default(true),
		configuredByUserId: text("configured_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_period_events_category_valid",
			sql`${t.category} IN ('ANNUAL', 'MONTHLY', 'WEEKLY')`,
		),
		uniqueIndex("evaluation_period_events_period_event_idx").on(
			t.evaluationPeriodId,
			t.eventId,
		),
		index("evaluation_period_events_period_category_idx").on(
			t.evaluationPeriodId,
			t.category,
		),
	],
).enableRLS();

export const evaluationEventScores = pgTable(
	"evaluation_event_scores",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		periodEventId: uuid("period_event_id")
			.notNull()
			.references(() => evaluationPeriodEvents.id),
		evaluatorUserId: text("evaluator_user_id")
			.notNull()
			.references(() => user.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		commitment: doublePrecision("commitment").notNull(),
		teamwork: doublePrecision("teamwork").notNull(),
		attitude: doublePrecision("attitude").notNull(),
		contribution: doublePrecision("contribution").notNull(),
		comment: text("comment"),
		submittedAt: timestamp("submitted_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_event_scores_no_self",
			sql`${t.evaluatorUserId} <> ${t.targetUserId}`,
		),
		check(
			"evaluation_event_scores_range",
			sql`${t.commitment} BETWEEN 0 AND 100 AND ${t.teamwork} BETWEEN 0 AND 100 AND ${t.attitude} BETWEEN 0 AND 100 AND ${t.contribution} BETWEEN 0 AND 100`,
		),
		uniqueIndex("evaluation_event_scores_unique_idx").on(
			t.periodEventId,
			t.evaluatorUserId,
			t.targetUserId,
		),
		index("evaluation_event_scores_period_target_idx").on(
			t.evaluationPeriodId,
			t.targetUserId,
		),
	],
).enableRLS();

export const evaluationDepartmentScores = pgTable(
	"evaluation_department_scores",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		quarterNumber: integer("quarter_number").notNull().default(1),
		evaluatorUserId: text("evaluator_user_id")
			.notNull()
			.references(() => user.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		targetDepartmentCode: text("target_department_code").notNull(),
		targetPositionCode: text("target_position_code").notNull(),
		commitment: doublePrecision("commitment").notNull(),
		teamwork: doublePrecision("teamwork").notNull(),
		attitude: doublePrecision("attitude").notNull(),
		contribution: doublePrecision("contribution").notNull(),
		comment: text("comment"),
		submittedAt: timestamp("submitted_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_department_scores_no_self",
			sql`${t.evaluatorUserId} <> ${t.targetUserId}`,
		),
		check(
			"evaluation_department_scores_quarter_valid",
			sql`${t.quarterNumber} >= 1`,
		),
		check(
			"evaluation_department_scores_snapshot_nonblank",
			sql`length(btrim(${t.targetDepartmentCode})) > 0 AND length(btrim(${t.targetPositionCode})) > 0`,
		),
		check(
			"evaluation_department_scores_range",
			sql`${t.commitment} BETWEEN 0 AND 100 AND ${t.teamwork} BETWEEN 0 AND 100 AND ${t.attitude} BETWEEN 0 AND 100 AND ${t.contribution} BETWEEN 0 AND 100`,
		),
		uniqueIndex("evaluation_department_scores_unique_idx").on(
			t.evaluationPeriodId,
			t.quarterNumber,
			t.evaluatorUserId,
			t.targetUserId,
		),
		index("evaluation_department_scores_period_target_idx").on(
			t.evaluationPeriodId,
			t.targetUserId,
		),
	],
).enableRLS();

export const evaluationGformResponses = pgTable(
	"evaluation_gform_responses",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		sourceType: text("source_type")
			.$type<EvaluationGformSourceType>()
			.notNull(),
		cycleNumber: integer("cycle_number").notNull().default(1),
		sourceReference: text("source_reference").notNull(),
		respondentKey: text("respondent_key").notNull(),
		respondentRole: text("respondent_role").notNull(),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		buildingCode: text("building_code"),
		answers: jsonb("answers").$type<number[]>().notNull(),
		totalScore: integer("total_score").notNull(),
		comment: text("comment"),
		importedByUserId: text("imported_by_user_id")
			.notNull()
			.references(() => user.id),
		importedAt: timestamp("imported_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_gform_responses_source_valid",
			sql`${t.sourceType} IN ('SR_MABA', 'EXTERNAL_ASUS_DITMAWA')`,
		),
		check("evaluation_gform_responses_cycle_valid", sql`${t.cycleNumber} >= 1`),
		check(
			"evaluation_gform_responses_text_nonblank",
			sql`length(btrim(${t.sourceReference})) > 0 AND length(btrim(${t.respondentKey})) > 0 AND length(btrim(${t.respondentRole})) > 0`,
		),
		check(
			"evaluation_gform_responses_score_valid",
			sql`(${t.sourceType} = 'SR_MABA' AND ${t.totalScore} BETWEEN 20 AND 100 AND jsonb_array_length(${t.answers}) = 20) OR (${t.sourceType} = 'EXTERNAL_ASUS_DITMAWA' AND ${t.totalScore} BETWEEN 10 AND 50 AND jsonb_array_length(${t.answers}) = 10)`,
		),
		uniqueIndex("evaluation_gform_responses_dedup_idx").on(
			t.evaluationPeriodId,
			t.sourceType,
			t.cycleNumber,
			t.respondentKey,
			t.targetUserId,
		),
		index("evaluation_gform_responses_period_target_idx").on(
			t.evaluationPeriodId,
			t.targetUserId,
		),
	],
).enableRLS();

export const evaluationAttendanceFallbacks = pgTable(
	"evaluation_attendance_fallbacks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		activityType: text("activity_type")
			.$type<EvaluationAttendanceActivityType>()
			.notNull(),
		activityTitle: text("activity_title").notNull(),
		activityDate: date("activity_date", { mode: "string" }).notNull(),
		attendanceStatus: text("attendance_status")
			.$type<EvaluationAttendanceStatus>()
			.notNull(),
		maxPoints: doublePrecision("max_points").notNull(),
		earnedPoints: doublePrecision("earned_points").notNull(),
		sourceKind: text("source_kind")
			.$type<"MANUAL_FALLBACK" | "IMPORT_FALLBACK">()
			.notNull(),
		sourceReference: text("source_reference"),
		notes: text("notes").notNull(),
		recordedByUserId: text("recorded_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_attendance_fallbacks_type_valid",
			sql`${t.activityType} IN ('RAPAT_ALL_PANITIA', 'EVENT_BESAR', 'EVENT_SEBAGIAN', 'SIDAK')`,
		),
		check(
			"evaluation_attendance_fallbacks_status_valid",
			sql`${t.attendanceStatus} IN ('HADIR_TEPAT_WAKTU', 'TERLAMBAT_DENGAN_IZIN', 'TERLAMBAT_TANPA_IZIN_MAX_15', 'TERLAMBAT_DENGAN_IZIN_LEBIH_15', 'TERLAMBAT_TANPA_IZIN_LEBIH_15', 'IZIN_DI_LUAR_5K', 'ALFA')`,
		),
		check(
			"evaluation_attendance_fallbacks_points_valid",
			sql`${t.maxPoints} > 0 AND ${t.earnedPoints} >= 0 AND ${t.earnedPoints} <= ${t.maxPoints}`,
		),
		check(
			"evaluation_attendance_fallbacks_text_nonblank",
			sql`length(btrim(${t.activityTitle})) > 0 AND length(btrim(${t.notes})) > 0`,
		),
		uniqueIndex("evaluation_attendance_fallbacks_dedup_idx").on(
			t.evaluationPeriodId,
			t.targetUserId,
			t.activityType,
			t.activityDate,
			t.activityTitle,
		),
		index("evaluation_attendance_fallbacks_period_target_idx").on(
			t.evaluationPeriodId,
			t.targetUserId,
		),
	],
).enableRLS();

export const evaluationPointTransactions = pgTable(
	"evaluation_point_transactions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		transactionType: text("transaction_type")
			.$type<EvaluationPointTransactionType>()
			.notNull(),
		points: doublePrecision("points").notNull(),
		category: text("category").notNull(),
		reason: text("reason").notNull(),
		occurredOn: date("occurred_on", { mode: "string" }).notNull(),
		status: text("status")
			.$type<EvaluationPointTransactionStatus>()
			.notNull()
			.default("PENDING"),
		proposedByUserId: text("proposed_by_user_id")
			.notNull()
			.references(() => user.id),
		decidedByUserId: text("decided_by_user_id").references(() => user.id),
		decisionNote: text("decision_note"),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_point_transactions_type_valid",
			sql`${t.transactionType} IN ('ADDITION', 'DEDUCTION')`,
		),
		check(
			"evaluation_point_transactions_points_positive",
			sql`${t.points} > 0`,
		),
		check(
			"evaluation_point_transactions_text_nonblank",
			sql`length(btrim(${t.category})) > 0 AND length(btrim(${t.reason})) > 0`,
		),
		check(
			"evaluation_point_transactions_status_consistent",
			sql`(${t.status} = 'PENDING' AND ${t.decidedByUserId} IS NULL AND ${t.decidedAt} IS NULL) OR (${t.status} IN ('APPROVED', 'REJECTED') AND ${t.decidedByUserId} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`,
		),
		index("evaluation_point_transactions_period_target_idx").on(
			t.evaluationPeriodId,
			t.targetUserId,
			t.status,
		),
		index("evaluation_point_transactions_proposer_idx").on(
			t.proposedByUserId,
			t.createdAt,
		),
	],
).enableRLS();

export const evaluationResultSnapshots = pgTable(
	"evaluation_result_snapshots",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		version: integer("version").notNull(),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		snapshotNim: text("snapshot_nim").notNull(),
		snapshotName: text("snapshot_name").notNull(),
		snapshotDepartmentCode: text("snapshot_department_code").notNull(),
		snapshotPositionCode: text("snapshot_position_code").notNull(),
		snapshotBuildingCode: text("snapshot_building_code").notNull(),
		snapshotBuildingName: text("snapshot_building_name").notNull(),
		annualWeighted: doublePrecision("annual_weighted").notNull(),
		monthlyWeighted: doublePrecision("monthly_weighted").notNull(),
		weeklyWeighted: doublePrecision("weekly_weighted").notNull(),
		departmentWeighted: doublePrecision("department_weighted").notNull(),
		gformWeighted: doublePrecision("gform_weighted").notNull(),
		totalWeightedScore: doublePrecision("total_weighted_score").notNull(),
		attendancePointsTotal: doublePrecision("attendance_points_total").notNull(),
		netAdjustmentPoints: doublePrecision("net_adjustment_points").notNull(),
		externalScoreAverage: doublePrecision("external_score_average"),
		componentBreakdown: jsonb("component_breakdown")
			.$type<Record<string, unknown>>()
			.notNull(),
		finalizedByUserId: text("finalized_by_user_id")
			.notNull()
			.references(() => user.id),
		finalizedAt: timestamp("finalized_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check("evaluation_result_snapshots_version_valid", sql`${t.version} > 0`),
		uniqueIndex("evaluation_result_snapshots_unique_idx").on(
			t.evaluationPeriodId,
			t.version,
			t.targetUserId,
		),
		index("evaluation_result_snapshots_target_idx").on(
			t.targetUserId,
			t.evaluationPeriodId,
		),
	],
).enableRLS();

export const evaluationAudits = pgTable(
	"evaluation_audits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		evaluationPeriodId: uuid("evaluation_period_id")
			.notNull()
			.references(() => evaluationPeriods.id),
		targetUserId: text("target_user_id").references(() => user.id),
		entityType: text("entity_type").notNull(),
		entityId: uuid("entity_id"),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action").notNull(),
		reason: text("reason").notNull(),
		beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
		afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			"evaluation_audits_entity_valid",
			sql`${t.entityType} IN ('PERIOD', 'PERIOD_EVENT', 'EVENT_SCORE', 'DEPARTMENT_SCORE', 'GFORM_IMPORT', 'ATTENDANCE_FALLBACK', 'POINT_TRANSACTION', 'FINALIZATION')`,
		),
		check(
			"evaluation_audits_nonblank",
			sql`length(btrim(${t.action})) > 0 AND length(btrim(${t.reason})) > 0`,
		),
		check(
			"evaluation_audits_state_object_valid",
			sql`(${t.beforeState} IS NULL OR jsonb_typeof(${t.beforeState}) = 'object') AND (${t.afterState} IS NULL OR jsonb_typeof(${t.afterState}) = 'object')`,
		),
		index("evaluation_audits_period_time_idx").on(
			t.evaluationPeriodId,
			t.createdAt,
		),
		index("evaluation_audits_actor_time_idx").on(t.actorUserId, t.createdAt),
	],
).enableRLS();

export const penilaianRelations = defineRelationsPart(
	{
		evaluationPeriods,
		evaluationPeriodEvents,
		evaluationEventScores,
		evaluationDepartmentScores,
		evaluationGformResponses,
		evaluationAttendanceFallbacks,
		evaluationPointTransactions,
		evaluationResultSnapshots,
		evaluationAudits,
		srPeriods,
		events,
		user,
	},
	(r) => ({
		evaluationPeriods: {
			srPeriod: r.one.srPeriods({
				from: r.evaluationPeriods.srPeriodId,
				to: r.srPeriods.id,
				optional: false,
			}),
			periodEvents: r.many.evaluationPeriodEvents({
				from: r.evaluationPeriods.id,
				to: r.evaluationPeriodEvents.evaluationPeriodId,
			}),
			audits: r.many.evaluationAudits({
				from: r.evaluationPeriods.id,
				to: r.evaluationAudits.evaluationPeriodId,
			}),
		},
		evaluationPeriodEvents: {
			period: r.one.evaluationPeriods({
				from: r.evaluationPeriodEvents.evaluationPeriodId,
				to: r.evaluationPeriods.id,
				optional: false,
			}),
			event: r.one.events({
				from: r.evaluationPeriodEvents.eventId,
				to: r.events.id,
				optional: false,
			}),
		},
	}),
);
