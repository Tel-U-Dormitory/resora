import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	attendanceAuditLogs,
	attendanceRecords,
	attendanceSessions,
	eventParticipants,
	events,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import {
	canManageManualAttendance,
	getActiveSrCandidate,
	getLiveOperationalIdentity,
} from "../identity/identity.public";
import { manualCorrectSchema, manualInsertSchema } from "./attendance.schema";
import {
	auditState,
	classifyTiming,
	manualEffectiveTime,
} from "./reporting-policy";

async function requireOperator(
	db: Database | DatabaseTransaction,
	identity: ActiveIdentity,
	lock = false,
) {
	if (!(await canManageManualAttendance(db, identity, lock)))
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "MANUAL_ACCESS_REQUIRED",
		});
}

async function lockContext(
	tx: DatabaseTransaction,
	identity: ActiveIdentity,
	eventId: string,
) {
	const [event] = await tx
		.select()
		.from(events)
		.where(eq(events.id, eventId))
		.for("update");
	if (!event) throw new TRPCError({ code: "NOT_FOUND" });
	const [session] = await tx
		.select()
		.from(attendanceSessions)
		.where(eq(attendanceSessions.internalEventId, eventId))
		.for("update");
	if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	// Re-read and share-lock current operator identity after lifecycle lock waits.
	const live = await getLiveOperationalIdentity(tx, identity.userId);
	if (!live)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "MANUAL_ACCESS_REQUIRED",
		});
	await requireOperator(tx, live, true);
	return { event, session };
}

async function requireInvitation(
	tx: DatabaseTransaction,
	eventId: string,
	userId: string,
) {
	const [invitation] = await tx
		.select({ userId: eventParticipants.userId })
		.from(eventParticipants)
		.where(
			and(
				eq(eventParticipants.eventId, eventId),
				eq(eventParticipants.userId, userId),
			),
		);
	if (!invitation)
		throw new TRPCError({ code: "FORBIDDEN", message: "NOT_INVITED" });
}

export async function manualInsert(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof manualInsertSchema>,
) {
	await requireOperator(db, identity);
	const data = manualInsertSchema.parse(input);
	return db.transaction(async (tx) => {
		const { event, session } = await lockContext(tx, identity, data.eventId);
		await requireInvitation(tx, event.id, data.userId);
		const match = and(
			eq(attendanceRecords.sessionId, session.id),
			eq(attendanceRecords.userId, data.userId),
		);
		const [existing] = await tx
			.select({ id: attendanceRecords.id })
			.from(attendanceRecords)
			.where(match);
		if (existing)
			throw new TRPCError({
				code: "CONFLICT",
				message: "ATTENDANCE_ALREADY_RECORDED",
			});
		if (!(await getActiveSrCandidate(tx, data.userId)))
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "MANUAL_TARGET_INACTIVE_OR_INELIGIBLE",
			});
		const now = new Date();
		const attendanceAt = manualEffectiveTime(
			event,
			session.status,
			data.attendanceAt,
			now,
		);
		const timingClass = classifyTiming(
			attendanceAt,
			event.startsAt,
			session.lateGraceMinutes,
		);
		const [record] = await tx
			.insert(attendanceRecords)
			.values({
				sessionId: session.id,
				userId: data.userId,
				attendanceAt,
				recordedAt: now,
				source: "MANUAL",
				timingClass,
				recordedByUserId: identity.userId,
				manualReason: data.reason,
				updatedAt: now,
			})
			.onConflictDoNothing({
				target: [attendanceRecords.sessionId, attendanceRecords.userId],
			})
			.returning();
		if (!record)
			throw new TRPCError({
				code: "CONFLICT",
				message: "ATTENDANCE_ALREADY_RECORDED",
			});
		await tx.insert(attendanceAuditLogs).values({
			attendanceId: record.id,
			sessionId: session.id,
			userId: data.userId,
			actorUserId: identity.userId,
			action: "MANUAL_CREATED",
			beforeState: null,
			afterState: auditState(record),
			reason: data.reason,
			createdAt: now,
		});
		return { attendanceId: record.id, attendanceAt, timingClass };
	});
}

export async function manualCorrect(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof manualCorrectSchema>,
) {
	await requireOperator(db, identity);
	const data = manualCorrectSchema.parse(input);
	return db.transaction(async (tx) => {
		const [binding] = await tx
			.select({ eventId: attendanceSessions.internalEventId })
			.from(attendanceRecords)
			.innerJoin(
				attendanceSessions,
				eq(attendanceSessions.id, attendanceRecords.sessionId),
			)
			.where(eq(attendanceRecords.id, data.attendanceId));
		if (!binding) throw new TRPCError({ code: "NOT_FOUND" });
		const { event, session } = await lockContext(tx, identity, binding.eventId);
		const [record] = await tx
			.select()
			.from(attendanceRecords)
			.where(
				and(
					eq(attendanceRecords.id, data.attendanceId),
					eq(attendanceRecords.sessionId, session.id),
				),
			)
			.for("update");
		if (!record) throw new TRPCError({ code: "NOT_FOUND" });
		await requireInvitation(tx, event.id, record.userId);
		// Historical correction uses the invitation, even if its participant is now inactive.
		const now = new Date();
		const attendanceAt = manualEffectiveTime(
			event,
			session.status,
			data.attendanceAt,
			now,
		);
		const timingClass = classifyTiming(
			attendanceAt,
			event.startsAt,
			session.lateGraceMinutes,
		);
		await tx
			.update(attendanceRecords)
			.set({ attendanceAt, timingClass, updatedAt: now })
			.where(eq(attendanceRecords.id, record.id));
		await tx.insert(attendanceAuditLogs).values({
			attendanceId: record.id,
			sessionId: session.id,
			userId: record.userId,
			actorUserId: identity.userId,
			action: "ATTENDANCE_CORRECTED",
			beforeState: auditState(record),
			afterState: auditState({ attendanceAt, timingClass }),
			reason: data.reason,
			createdAt: now,
		});
		return { attendanceId: record.id, attendanceAt, timingClass };
	});
}
