import { defineRelationsPart, sql } from "drizzle-orm";
import {
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type { officialDepartments } from "../organization";
import { user } from "./auth";

export type RosterCriteria = {
	allSr: boolean;
	departments: (typeof officialDepartments)[number]["code"][];
	inti: boolean;
	kadep: boolean;
	individuals: string[];
	include: string[];
	exclude: string[];
};
export type EventVisibility = "VISIBLE" | "HIDDEN" | "ARCHIVED";
export const events = pgTable(
	"events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		status: text("status")
			.$type<"DRAFT" | "PUBLISHED" | "CLOSED">()
			.notNull()
			.default("DRAFT"),
		visibility: text("visibility")
			.$type<EventVisibility>()
			.notNull()
			.default("VISIBLE"),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		rosterCriteria: jsonb("roster_criteria").$type<RosterCriteria>().notNull(),
		publishedAt: timestamp("published_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check("events_title_nonblank", sql`length(btrim(${t.title})) > 0`),
		check(
			"events_visibility",
			sql`${t.visibility} IN ('VISIBLE', 'HIDDEN', 'ARCHIVED')`,
		),
		check(
			"events_visibility_lifecycle",
			sql`(${t.status} <> 'DRAFT' OR ${t.visibility} = 'VISIBLE') AND (${t.visibility} <> 'ARCHIVED' OR ${t.status} = 'CLOSED')`,
		),
		check("events_schedule_order", sql`${t.endsAt} > ${t.startsAt}`),
		check(
			"events_lifecycle",
			sql`(${t.status} = 'DRAFT' AND ${t.publishedAt} IS NULL AND ${t.closedAt} IS NULL) OR (${t.status} = 'PUBLISHED' AND ${t.publishedAt} IS NOT NULL AND ${t.closedAt} IS NULL) OR (${t.status} = 'CLOSED' AND ${t.publishedAt} IS NOT NULL AND ${t.closedAt} IS NOT NULL)`,
		),
		index("events_status_start_idx").on(t.status, t.startsAt),
	],
);
export const eventParticipants = pgTable(
	"event_participants",
	{
		eventId: uuid("event_id")
			.notNull()
			.references(() => events.id),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		nim: text("snapshot_nim").notNull(),
		name: text("snapshot_name").notNull(),
		departmentCode: text("snapshot_department").notNull(),
		positionCode: text("snapshot_position").notNull(),
		buildingCode: text("snapshot_building_code").notNull(),
		buildingName: text("snapshot_building_name").notNull(),
		invitedAt: timestamp("invited_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.eventId, t.userId] }),
		index("event_participants_user_event_idx").on(t.userId, t.eventId),
	],
);
export const attendanceSessions = pgTable(
	"attendance_sessions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		internalEventId: uuid("internal_event_id")
			.notNull()
			.unique()
			.references(() => events.id),
		status: text("status")
			.$type<"INACTIVE" | "ACTIVE" | "CLOSED">()
			.notNull()
			.default("INACTIVE"),
		centerLat: doublePrecision("center_lat").notNull(),
		centerLng: doublePrecision("center_lng").notNull(),
		geofenceRadiusM: integer("geofence_radius_m").notNull().default(20),
		lateGraceMinutes: integer("late_grace_minutes").notNull().default(15),
		qrTtlMinutes: integer("qr_ttl_minutes").notNull().default(360),
		activatedAt: timestamp("activated_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"attendance_sessions_coordinates",
			sql`${t.centerLat} BETWEEN -90 AND 90 AND ${t.centerLng} BETWEEN -180 AND 180`,
		),
		check(
			"attendance_sessions_policy",
			sql`${t.geofenceRadiusM} > 0 AND ${t.lateGraceMinutes} >= 0 AND ${t.qrTtlMinutes} > 0`,
		),
		check(
			"attendance_sessions_lifecycle",
			sql`(${t.status} = 'INACTIVE' AND ${t.activatedAt} IS NULL AND ${t.closedAt} IS NULL) OR (${t.status} = 'ACTIVE' AND ${t.activatedAt} IS NOT NULL AND ${t.closedAt} IS NULL) OR (${t.status} = 'CLOSED' AND ${t.closedAt} IS NOT NULL)`,
		),
	],
);
export const qrChallenges = pgTable(
	"qr_challenges",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => attendanceSessions.id),
		activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		isCurrent: boolean("is_current").notNull().default(true),
		issuedByUserId: text("issued_by_user_id")
			.notNull()
			.references(() => user.id),
	},
	(t) => [
		uniqueIndex("qr_challenges_current_session_idx")
			.on(t.sessionId)
			.where(sql`${t.isCurrent} = true`),
		check("qr_challenges_expiry", sql`${t.expiresAt} > ${t.activatedAt}`),
	],
);
export const attendanceRecords = pgTable(
	"attendance_records",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => attendanceSessions.id),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		attendanceAt: timestamp("attendance_at", { withTimezone: true }).notNull(),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		source: text("source").$type<"QR" | "MANUAL">().notNull(),
		timingClass: text("timing_class")
			.$type<"EARLY" | "ON_TIME" | "LATE">()
			.notNull(),
		recordedByUserId: text("recorded_by_user_id")
			.notNull()
			.references(() => user.id),
		manualReason: text("manual_reason"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		scanLat: doublePrecision("scan_lat"),
		scanLng: doublePrecision("scan_lng"),
		gpsAccuracyM: doublePrecision("gps_accuracy_m"),
	},
	(t) => [
		unique("attendance_records_session_user_unique").on(t.sessionId, t.userId),
		index("attendance_records_user_time_idx").on(
			t.userId,
			t.attendanceAt.desc(),
		),
		check("attendance_records_source", sql`${t.source} IN ('QR', 'MANUAL')`),
		check(
			"attendance_records_timing",
			sql`${t.timingClass} IN ('EARLY', 'ON_TIME', 'LATE')`,
		),
		check(
			"attendance_records_manual_reason",
			sql`${t.source} <> 'MANUAL' OR (${t.manualReason} IS NOT NULL AND length(btrim(${t.manualReason})) > 0)`,
		),
		check(
			"attendance_records_gps_package",
			sql`(${t.source} = 'QR' AND ${t.scanLat} IS NOT NULL AND ${t.scanLng} IS NOT NULL AND ${t.gpsAccuracyM} IS NOT NULL AND ${t.scanLat} BETWEEN -90 AND 90 AND ${t.scanLng} BETWEEN -180 AND 180 AND ${t.gpsAccuracyM} > 0 AND ${t.gpsAccuracyM} < 'Infinity'::double precision) OR (${t.source} = 'MANUAL' AND ${t.scanLat} IS NULL AND ${t.scanLng} IS NULL AND ${t.gpsAccuracyM} IS NULL)`,
		),
	],
);
export type AttendanceAuditState = {
	attendanceAt: string;
	timingClass: "EARLY" | "ON_TIME" | "LATE";
};
export const attendanceAuditLogs = pgTable(
	"attendance_audit_logs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		attendanceId: uuid("attendance_id")
			.notNull()
			.references(() => attendanceRecords.id),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => attendanceSessions.id),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action")
			.$type<"MANUAL_CREATED" | "ATTENDANCE_CORRECTED">()
			.notNull(),
		beforeState: jsonb("before_state").$type<AttendanceAuditState>(),
		afterState: jsonb("after_state").$type<AttendanceAuditState>().notNull(),
		reason: text("reason").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("attendance_audit_logs_attendance_time_idx").on(
			t.attendanceId,
			t.createdAt,
		),
		index("attendance_audit_logs_session_time_idx").on(
			t.sessionId,
			t.createdAt,
		),
		check("attendance_audit_logs_reason", sql`length(btrim(${t.reason})) > 0`),
		check(
			"attendance_audit_logs_action_state",
			sql`(${t.action} = 'MANUAL_CREATED' AND ${t.beforeState} IS NULL) OR (${t.action} = 'ATTENDANCE_CORRECTED' AND ${t.beforeState} IS NOT NULL)`,
		),
	],
);
export type EventEditAuditState = {
	title: string;
	description: string;
	startsAt: string;
	endsAt: string;
	rosterCriteria?: RosterCriteria;
	session?: Pick<
		typeof attendanceSessions.$inferSelect,
		| "centerLat"
		| "centerLng"
		| "geofenceRadiusM"
		| "lateGraceMinutes"
		| "qrTtlMinutes"
	>;
	participants?: {
		count: number;
		addedUserIds?: string[];
		removedUserIds?: string[];
	};
};
export const eventAuditLogs = pgTable(
	"event_audit_logs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		eventId: uuid("event_id")
			.notNull()
			.references(() => events.id),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action")
			.$type<
				| "PUBLISHED_CONFIGURATION_EDITED"
				| "PUBLISHED_DETAILS_EDITED"
				| "CLOSED_METADATA_EDITED"
				| "EVENT_HIDDEN"
				| "EVENT_UNHIDDEN"
				| "EVENT_ARCHIVED"
				| "EVENT_RESTORED"
			>()
			.notNull(),
		reason: text("reason").notNull(),
		beforeState: jsonb("before_state")
			.$type<EventEditAuditState | { visibility: EventVisibility }>()
			.notNull(),
		afterState: jsonb("after_state")
			.$type<EventEditAuditState | { visibility: EventVisibility }>()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("event_audit_logs_event_time_idx").on(t.eventId, t.createdAt),
		check("event_audit_logs_reason", sql`length(btrim(${t.reason})) > 0`),
		check(
			"event_audit_logs_action",
			sql`${t.action} IN ('PUBLISHED_CONFIGURATION_EDITED', 'PUBLISHED_DETAILS_EDITED', 'CLOSED_METADATA_EDITED', 'EVENT_HIDDEN', 'EVENT_UNHIDDEN', 'EVENT_ARCHIVED', 'EVENT_RESTORED')`,
		),
		check(
			"event_audit_logs_states",
			sql`jsonb_typeof(${t.beforeState}) = 'object' AND jsonb_typeof(${t.afterState}) = 'object'`,
		),
	],
);
// No event FK: the immutable tombstone must outlive the deleted DRAFT.
// All nondeleted event audits keep their original FK in event_audit_logs.
export const eventDeletionAudits = pgTable(
	"event_deletion_audits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		eventId: uuid("event_id").notNull().unique(),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action").$type<"EVENT_DRAFT_DELETED">().notNull(),
		reason: text("reason").notNull(),
		eventSnapshot: jsonb("event_snapshot")
			.$type<{
				title: string;
				status: "DRAFT";
				startsAt: string;
				endsAt: string;
			}>()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			"event_deletion_audits_action",
			sql`${t.action} = 'EVENT_DRAFT_DELETED'`,
		),
		check("event_deletion_audits_reason", sql`length(btrim(${t.reason})) > 0`),
		check(
			"event_deletion_audits_snapshot",
			sql`jsonb_typeof(${t.eventSnapshot}) = 'object'`,
		),
	],
);
export const attendanceRelations = defineRelationsPart(
	{
		events,
		attendanceSessions,
		eventParticipants,
		qrChallenges,
		attendanceRecords,
		attendanceAuditLogs,
		eventAuditLogs,
		eventDeletionAudits,
		user,
	},
	(r) => ({
		events: {
			audits: r.many.eventAuditLogs({
				from: r.events.id,
				to: r.eventAuditLogs.eventId,
			}),
			session: r.one.attendanceSessions({
				from: r.events.id,
				to: r.attendanceSessions.internalEventId,
				optional: false,
			}),
			participants: r.many.eventParticipants({
				from: r.events.id,
				to: r.eventParticipants.eventId,
			}),
		},
		attendanceSessions: {
			event: r.one.events({
				from: r.attendanceSessions.internalEventId,
				to: r.events.id,
				optional: false,
			}),
			challenges: r.many.qrChallenges({
				from: r.attendanceSessions.id,
				to: r.qrChallenges.sessionId,
			}),
			records: r.many.attendanceRecords({
				from: r.attendanceSessions.id,
				to: r.attendanceRecords.sessionId,
			}),
		},
		eventParticipants: {
			event: r.one.events({
				from: r.eventParticipants.eventId,
				to: r.events.id,
				optional: false,
			}),
		},
		qrChallenges: {
			session: r.one.attendanceSessions({
				from: r.qrChallenges.sessionId,
				to: r.attendanceSessions.id,
				optional: false,
			}),
		},
		attendanceRecords: {
			audits: r.many.attendanceAuditLogs({
				from: r.attendanceRecords.id,
				to: r.attendanceAuditLogs.attendanceId,
			}),
			session: r.one.attendanceSessions({
				from: r.attendanceRecords.sessionId,
				to: r.attendanceSessions.id,
				optional: false,
			}),
			participant: r.one.user({
				from: r.attendanceRecords.userId,
				to: r.user.id,
				optional: false,
			}),
			recorder: r.one.user({
				from: r.attendanceRecords.recordedByUserId,
				to: r.user.id,
				optional: false,
			}),
		},
		attendanceAuditLogs: {
			record: r.one.attendanceRecords({
				from: r.attendanceAuditLogs.attendanceId,
				to: r.attendanceRecords.id,
				optional: false,
			}),
			session: r.one.attendanceSessions({
				from: r.attendanceAuditLogs.sessionId,
				to: r.attendanceSessions.id,
				optional: false,
			}),
			participant: r.one.user({
				from: r.attendanceAuditLogs.userId,
				to: r.user.id,
				optional: false,
			}),
			actor: r.one.user({
				from: r.attendanceAuditLogs.actorUserId,
				to: r.user.id,
				optional: false,
			}),
		},
		eventAuditLogs: {
			event: r.one.events({
				from: r.eventAuditLogs.eventId,
				to: r.events.id,
				optional: false,
			}),
			actor: r.one.user({
				from: r.eventAuditLogs.actorUserId,
				to: r.user.id,
				optional: false,
			}),
		},
		eventDeletionAudits: {
			actor: r.one.user({
				from: r.eventDeletionAudits.actorUserId,
				to: r.user.id,
				optional: false,
			}),
		},
	}),
);
