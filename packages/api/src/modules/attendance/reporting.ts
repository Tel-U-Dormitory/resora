import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	attendanceAuditLogs,
	attendanceRecords,
	attendanceSessions,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import {
	auditHistorySchema,
	ownHistorySchema,
} from "../../contracts/attendance";
import {
	ownInvitedEventHistory,
	readEvent,
	reportInvitationSnapshots,
} from "../events/events.public";
import {
	canAccessPersonalSr,
	canManageInternalEvent,
	canManageManualAttendance,
	getUserDisplayNames,
	isValidSrAssignment,
} from "../identity/identity.public";
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
			const [event] = await readEvent(tx, eventId);
			const [session] = await tx
				.select({
					id: attendanceSessions.id,
					lateGraceMinutes: attendanceSessions.lateGraceMinutes,
				})
				.from(attendanceSessions)
				.where(eq(attendanceSessions.internalEventId, eventId));
			const context =
				event && session
					? {
							event: {
								id: event.id,
								title: event.title,
								status: event.status,
								startsAt: event.startsAt,
								closedAt: event.closedAt,
								organizationContext: event.organizationContext,
								committeeName: event.snapshotCommitteeName,
							},
							session,
						}
					: null;
			if (!context || context.event.status === "DRAFT")
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "RECAP_UNAVAILABLE",
				});
			const invitations = await reportInvitationSnapshots(tx, eventId);
			const records = await tx
				.select({ userId: attendanceRecords.userId, ...recordFields })
				.from(attendanceRecords)
				.where(eq(attendanceRecords.sessionId, context.session.id));
			const byUser = new Map(records.map((record) => [record.userId, record]));
			const rows = invitations.map((participant) => ({
				participant,
				record: byUser.get(participant.userId) ?? null,
			}));
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
	return db.transaction(
		async (tx) => {
			const events = await ownInvitedEventHistory(
				tx,
				identity.userId,
				limit + 1,
				offset,
			);
			const eventIds = events.map((row) => row.event.id);
			const attendance = eventIds.length
				? await tx
						.select({
							session: {
								internalEventId: attendanceSessions.internalEventId,
								lateGraceMinutes: attendanceSessions.lateGraceMinutes,
							},
							record: recordFields,
						})
						.from(attendanceSessions)
						.leftJoin(
							attendanceRecords,
							and(
								eq(attendanceRecords.sessionId, attendanceSessions.id),
								eq(attendanceRecords.userId, identity.userId),
							),
						)
						.where(inArray(attendanceSessions.internalEventId, eventIds))
				: [];
			const byEvent = new Map(
				attendance.map((row) => [row.session.internalEventId, row]),
			);
			const rows = events.map(({ event }) => {
				const data = byEvent.get(event.id);
				if (!data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				return {
					event,
					grace: data.session.lateGraceMinutes,
					record: data.record,
				};
			});
			return {
				items: rows.slice(0, limit).map(({ event, grace, record }) => ({
					event,
					...reportAttendance(record, event.status, event.startsAt, grace),
				})),
				nextOffset: rows.length > limit ? offset + limit : null,
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
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
			actorUserId: attendanceAuditLogs.actorUserId,
			createdAt: attendanceAuditLogs.createdAt,
			reason: attendanceAuditLogs.reason,
			before: attendanceAuditLogs.beforeState,
			after: attendanceAuditLogs.afterState,
		})
		.from(attendanceAuditLogs)
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
	const names = await getUserDisplayNames(
		db,
		rows.map((row) => row.actorUserId),
	);
	// Deliberate projection, not arbitrary JSON/raw record disclosure.
	return {
		items: rows.slice(0, data.limit).map((row) => ({
			id: row.id,
			action: row.action,
			operator: names.get(row.actorUserId) ?? "",
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
