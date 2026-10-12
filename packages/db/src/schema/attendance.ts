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
export const attendanceRelations = defineRelationsPart(
	{ events, attendanceSessions, eventParticipants, qrChallenges },
	(r) => ({
		events: {
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
	}),
);
