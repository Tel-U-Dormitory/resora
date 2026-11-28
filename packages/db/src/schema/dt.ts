import { defineRelationsPart, sql } from "drizzle-orm";
import {
	check,
	date,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { buildings, departments } from "./identity";

export const dtMembershipStatuses = [
	"CANDIDATE",
	"ACTIVE",
	"ENDED",
	"REJECTED",
	"ARCHIVED",
] as const;
export type DtMembershipStatus = (typeof dtMembershipStatuses)[number];

export const dtAuditActions = [
	"CANDIDATE_REGISTERED",
	"MEMBERSHIP_ACTIVATED",
	"MEMBERSHIP_REJECTED",
	"PERIOD_EXTENDED",
	"MEMBERSHIP_ENDED",
	"MEMBERSHIP_ARCHIVED",
	"ASSIGNMENT_UPDATED",
	"PASSWORD_RESET",
] as const;
export type DtAuditAction = (typeof dtAuditActions)[number];

export const dtMemberships = pgTable(
	"dt_memberships",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		periodName: text("period_name").notNull(),
		status: text("status")
			.$type<DtMembershipStatus>()
			.notNull()
			.default("CANDIDATE"),
		startsOn: date("starts_on", { mode: "string" }),
		endsOn: date("ends_on", { mode: "string" }),
		departmentCode: text("department_code").references(() => departments.code),
		buildingId: uuid("building_id").references(() => buildings.id),
		workProgram: text("work_program"),
		registrationNotes: text("registration_notes").notNull().default(""),
		registeredByUserId: text("registered_by_user_id")
			.notNull()
			.references(() => user.id),
		reviewedByUserId: text("reviewed_by_user_id").references(() => user.id),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		decisionReason: text("decision_reason"),
		endedByUserId: text("ended_by_user_id").references(() => user.id),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		endedReason: text("ended_reason"),
		archivedByUserId: text("archived_by_user_id").references(() => user.id),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
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
			"dt_memberships_status_valid",
			sql`${t.status} IN ('CANDIDATE', 'ACTIVE', 'ENDED', 'REJECTED', 'ARCHIVED')`,
		),
		check(
			"dt_memberships_period_nonblank",
			sql`length(btrim(${t.periodName})) > 0`,
		),
		check(
			"dt_memberships_dates_consistent",
			sql`(${t.status} IN ('CANDIDATE', 'REJECTED') AND ((${t.startsOn} IS NULL AND ${t.endsOn} IS NULL) OR (${t.startsOn} IS NOT NULL AND ${t.endsOn} IS NOT NULL AND ${t.endsOn} >= ${t.startsOn}))) OR (${t.status} IN ('ACTIVE', 'ENDED', 'ARCHIVED') AND ${t.startsOn} IS NOT NULL AND ${t.endsOn} IS NOT NULL AND ${t.endsOn} >= ${t.startsOn})`,
		),
		uniqueIndex("dt_memberships_single_active_user_idx")
			.on(t.userId)
			.where(sql`${t.status} = 'ACTIVE'`),
		uniqueIndex("dt_memberships_single_candidate_user_idx")
			.on(t.userId)
			.where(sql`${t.status} = 'CANDIDATE'`),
		index("dt_memberships_status_idx").on(t.status),
		index("dt_memberships_user_created_idx").on(t.userId, t.createdAt),
		index("dt_memberships_dept_status_idx").on(t.departmentCode, t.status),
		index("dt_memberships_building_status_idx").on(t.buildingId, t.status),
	],
).enableRLS();

export const dtAssignmentHistories = pgTable(
	"dt_assignment_histories",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => dtMemberships.id),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		departmentCode: text("department_code").references(() => departments.code),
		buildingId: uuid("building_id").references(() => buildings.id),
		workProgram: text("work_program"),
		reason: text("reason").notNull(),
		assignedByUserId: text("assigned_by_user_id")
			.notNull()
			.references(() => user.id),
		effectiveFrom: timestamp("effective_from", { withTimezone: true })
			.defaultNow()
			.notNull(),
		effectiveTo: timestamp("effective_to", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			"dt_assignment_histories_reason_nonblank",
			sql`length(btrim(${t.reason})) > 0`,
		),
		check(
			"dt_assignment_histories_window_valid",
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
		),
		index("dt_assignment_histories_membership_idx").on(
			t.membershipId,
			t.effectiveFrom,
		),
		index("dt_assignment_histories_user_idx").on(t.userId, t.effectiveFrom),
	],
).enableRLS();

export const dtAudits = pgTable(
	"dt_audits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => dtMemberships.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action").$type<DtAuditAction>().notNull(),
		reason: text("reason").notNull(),
		beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
		afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			"dt_audits_action_valid",
			sql`${t.action} IN ('CANDIDATE_REGISTERED', 'MEMBERSHIP_ACTIVATED', 'MEMBERSHIP_REJECTED', 'PERIOD_EXTENDED', 'MEMBERSHIP_ENDED', 'MEMBERSHIP_ARCHIVED', 'ASSIGNMENT_UPDATED', 'PASSWORD_RESET')`,
		),
		check("dt_audits_reason_nonblank", sql`length(btrim(${t.reason})) > 0`),
		check(
			"dt_audits_state_valid",
			sql`(${t.beforeState} IS NULL OR jsonb_typeof(${t.beforeState}) = 'object') AND (${t.afterState} IS NULL OR jsonb_typeof(${t.afterState}) = 'object')`,
		),
		index("dt_audits_membership_created_idx").on(t.membershipId, t.createdAt),
		index("dt_audits_target_created_idx").on(t.targetUserId, t.createdAt),
	],
).enableRLS();

export const dtRelations = defineRelationsPart(
	{
		dtMemberships,
		dtAssignmentHistories,
		dtAudits,
		user,
		departments,
		buildings,
	},
	(r) => ({
		dtMemberships: {
			member: r.one.user({
				from: r.dtMemberships.userId,
				to: r.user.id,
				optional: false,
			}),
			department: r.one.departments({
				from: r.dtMemberships.departmentCode,
				to: r.departments.code,
			}),
			building: r.one.buildings({
				from: r.dtMemberships.buildingId,
				to: r.buildings.id,
			}),
			assignments: r.many.dtAssignmentHistories({
				from: r.dtMemberships.id,
				to: r.dtAssignmentHistories.membershipId,
			}),
			audits: r.many.dtAudits({
				from: r.dtMemberships.id,
				to: r.dtAudits.membershipId,
			}),
		},
		dtAssignmentHistories: {
			membership: r.one.dtMemberships({
				from: r.dtAssignmentHistories.membershipId,
				to: r.dtMemberships.id,
				optional: false,
			}),
		},
		dtAudits: {
			membership: r.one.dtMemberships({
				from: r.dtAudits.membershipId,
				to: r.dtMemberships.id,
				optional: false,
			}),
		},
	}),
);
