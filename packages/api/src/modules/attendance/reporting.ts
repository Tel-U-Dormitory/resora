import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	attendanceAuditLogs,
	attendanceRecords,
	attendanceSessions,
	eventParticipants,
	events,
} from "@resora/db/schema/attendance";
import { user } from "@resora/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import {
	canAccessPersonalSr,
	canManageInternalEvent,
	canManageManualAttendance,
	isValidSrAssignment,
} from "../identity/identity.public";
import { auditHistorySchema, ownHistorySchema } from "./attendance.schema";
import {
	filterRecapParticipants,
	type RecapFilters,
} from "./reporting-context";
import { attendanceCsv, reportAttendance } from "./reporting-policy";

const recordFields = {
	id: attendanceRecords.id,
	attendanceAt: attendanceRecords.attendanceAt,
	timingClass: attendanceRecords.timingClass,
	source: attendanceRecords.source,
};
const snapshotFields = {
	userId: eventParticipants.userId,
	nim: eventParticipants.nim,
	name: eventParticipants.name,
	departmentCode: eventParticipants.departmentCode,
	positionCode: eventParticipants.positionCode,
	buildingCode: eventParticipants.buildingCode,
	buildingName: eventParticipants.buildingName,
	committeeDivision: eventParticipants.committeeDivision,
	committeePosition: eventParticipants.committeePosition,
};

export async function recap(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	if (!canManageInternalEvent(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	// The context and participant report share one MVCC snapshot even if close/correct races a read.
	return db.transaction(
		async (tx) => {
			const [context] = await tx
				.select({
					event: {
						id: events.id,
						title: events.title,
						status: events.status,
						startsAt: events.startsAt,
						closedAt: events.closedAt,
						organizationContext: events.organizationContext,
						committeeName: events.snapshotCommitteeName,
					},
					session: {
						id: attendanceSessions.id,
						lateGraceMinutes: attendanceSessions.lateGraceMinutes,
					},
				})
				.from(events)
				.innerJoin(
					attendanceSessions,
					eq(attendanceSessions.internalEventId, events.id),
				)
				.where(eq(events.id, eventId));
			if (!context || context.event.status === "DRAFT")
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "RECAP_UNAVAILABLE",
				});
			const rows = await tx
				.select({ participant: snapshotFields, record: recordFields })
				.from(eventParticipants)
				.leftJoin(
					attendanceRecords,
					and(
						eq(attendanceRecords.sessionId, context.session.id),
						eq(attendanceRecords.userId, eventParticipants.userId),
					),
				)
				.where(eq(eventParticipants.eventId, eventId))
				.orderBy(asc(eventParticipants.nim), asc(eventParticipants.userId));
			const participants = rows.map(({ participant, record }) => ({
				...participant,
				committeeDivision: participant.committeeDivision ?? null,
				committeePosition: participant.committeePosition ?? null,
				...reportAttendance(
					record,
					context.event.status,
					context.event.startsAt,
					context.session.lateGraceMinutes,
				),
			}));
			return {
				event: {
					...context.event,
					organizationContext: context.event.organizationContext ?? "SR",
					committeeName:
						context.event.organizationContext === "COMMITTEE"
							? context.event.committeeName
							: null,
				},
				canManual: await canManageManualAttendance(tx, identity),
				counts: {
					invited: participants.length,
					present: participants.filter((row) => row.presence === "PRESENT")
						.length,
					pending: participants.filter((row) => row.presence === "PENDING")
						.length,
					absent: participants.filter((row) => row.presence === "ABSENT")
						.length,
				},
				participants,
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function exportCsv(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	filters: RecapFilters = {},
) {
	const report = await recap(db, identity, eventId);
	if (
		report.event.organizationContext !== "COMMITTEE" &&
		filters.participantType &&
		filters.participantType !== "ALL"
	)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "PARTICIPANT_TYPE_NOT_APPLICABLE",
		});
	return {
		filename: `attendance-${report.event.id}-${new Date().toISOString().slice(0, 10)}.csv`,
		content: attendanceCsv(
			filterRecapParticipants(report.event, report.participants, filters),
			report.event,
		),
	};
}

export async function ownHistory(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof ownHistorySchema>,
) {
	if (
		!canAccessPersonalSr(identity) ||
		!isValidSrAssignment(identity.departmentCode, identity.positionCode)
	)
		throw new TRPCError({ code: "FORBIDDEN" });
	const { limit, offset } = ownHistorySchema.parse(input);
	const rows = await db
		.select({
			event: {
				id: events.id,
				title: events.title,
				status: events.status,
				startsAt: events.startsAt,
				endsAt: events.endsAt,
			},
			grace: attendanceSessions.lateGraceMinutes,
			record: recordFields,
		})
		.from(eventParticipants)
		.innerJoin(events, eq(events.id, eventParticipants.eventId))
		.innerJoin(
			attendanceSessions,
			eq(attendanceSessions.internalEventId, events.id),
		)
		.leftJoin(
			attendanceRecords,
			and(
				eq(attendanceRecords.sessionId, attendanceSessions.id),
				eq(attendanceRecords.userId, eventParticipants.userId),
			),
		)
		.where(
			and(
				eq(eventParticipants.userId, identity.userId),
				ne(events.status, "DRAFT"),
			),
		)
		.orderBy(desc(events.startsAt), desc(events.id))
		.limit(limit + 1)
		.offset(offset);
	return {
		items: rows.slice(0, limit).map(({ event, grace, record }) => ({
			event,
			...reportAttendance(record, event.status, event.startsAt, grace),
		})),
		nextOffset: rows.length > limit ? offset + limit : null,
	};
}

export async function auditHistory(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof auditHistorySchema>,
) {
	if (!(await canManageManualAttendance(db, identity)))
		throw new TRPCError({ code: "FORBIDDEN" });
	const data = auditHistorySchema.parse(input);
	const rows = await db
		.select({
			id: attendanceAuditLogs.id,
			action: attendanceAuditLogs.action,
			operator: user.name,
			createdAt: attendanceAuditLogs.createdAt,
			reason: attendanceAuditLogs.reason,
			before: attendanceAuditLogs.beforeState,
			after: attendanceAuditLogs.afterState,
		})
		.from(attendanceAuditLogs)
		.innerJoin(user, eq(user.id, attendanceAuditLogs.actorUserId))
		.innerJoin(
			attendanceSessions,
			eq(attendanceSessions.id, attendanceAuditLogs.sessionId),
		)
		.where(
			and(
				eq(attendanceSessions.internalEventId, data.eventId),
				eq(attendanceAuditLogs.userId, data.userId),
			),
		)
		.orderBy(desc(attendanceAuditLogs.createdAt), desc(attendanceAuditLogs.id))
		.limit(data.limit + 1)
		.offset(data.offset);
	// Deliberate projection, not arbitrary JSON/raw record disclosure.
	return {
		items: rows.slice(0, data.limit).map((row) => ({
			id: row.id,
			action: row.action,
			operator: row.operator,
			createdAt: row.createdAt,
			reason: row.reason,
			before: row.before
				? {
						attendanceAt: row.before.attendanceAt,
						timingClass: row.before.timingClass,
					}
				: null,
			after: {
				attendanceAt: row.after.attendanceAt,
				timingClass: row.after.timingClass,
			},
		})),
		nextOffset: rows.length > data.limit ? data.offset + data.limit : null,
	};
}
