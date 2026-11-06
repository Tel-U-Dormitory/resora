import type { Database, DatabaseTransaction } from "@resora/db";
import {
	attendanceAuditLogs,
	attendanceRecords,
	attendanceSessions,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { and, eq, sql } from "drizzle-orm";
import type { EventDraft } from "../../contracts/attendance";

type Db = Database | DatabaseTransaction;
export type SessionFact = typeof attendanceSessions.$inferSelect;
export async function lockInternalSession(db: Db, eventId: string) {
	return await db
		.select()
		.from(attendanceSessions)
		.where(eq(attendanceSessions.internalEventId, eventId))
		.for("update");
}

export async function recordExistsForSession(db: Db, sessionId: string) {
	return await db
		.select({ id: attendanceRecords.id })
		.from(attendanceRecords)
		.where(eq(attendanceRecords.sessionId, sessionId))
		.limit(1);
}

export async function configureSession(
	db: Db,
	sessionId: string,
	configuration: EventDraft["session"],
) {
	return await db
		.update(attendanceSessions)
		.set(configuration)
		.where(eq(attendanceSessions.id, sessionId));
}

export async function sessionHasDeletionReferences(db: Db, sessionId: string) {
	return await db
		.select({
			hasReferences: sql<boolean>`EXISTS (SELECT 1 FROM ${attendanceRecords} WHERE ${attendanceRecords.sessionId} = ${sessionId}) OR EXISTS (SELECT 1 FROM ${qrChallenges} WHERE ${qrChallenges.sessionId} = ${sessionId}) OR EXISTS (SELECT 1 FROM ${attendanceAuditLogs} WHERE ${attendanceAuditLogs.sessionId} = ${sessionId})`,
		})
		.from(attendanceSessions)
		.where(eq(attendanceSessions.id, sessionId));
}

export async function deleteUnusedSession(db: Db, sessionId: string) {
	return await db
		.delete(attendanceSessions)
		.where(eq(attendanceSessions.id, sessionId))
		.returning({ id: attendanceSessions.id });
}

export async function createInternalSession(
	db: Db,
	eventId: string,
	configuration: EventDraft["session"],
) {
	return await db
		.insert(attendanceSessions)
		.values({ internalEventId: eventId, ...configuration });
}

export async function configureInternalSession(
	db: Db,
	eventId: string,
	configuration: EventDraft["session"],
) {
	return await db
		.update(attendanceSessions)
		.set(configuration)
		.where(eq(attendanceSessions.internalEventId, eventId));
}

export async function readInternalSession(db: Db, eventId: string) {
	return await db
		.select()
		.from(attendanceSessions)
		.where(eq(attendanceSessions.internalEventId, eventId));
}

export async function activateInternalSession(
	db: Db,
	sessionId: string,
	now: Date,
) {
	return await db
		.update(attendanceSessions)
		.set({ status: "ACTIVE", activatedAt: now })
		.where(eq(attendanceSessions.id, sessionId));
}

export async function issueSessionChallenge(
	db: Db,
	session: SessionFact,
	now: Date,
	actorUserId: string,
) {
	return await db.insert(qrChallenges).values({
		sessionId: session.id,
		activatedAt: now,
		expiresAt: new Date(now.getTime() + session.qrTtlMinutes * 60_000),
		issuedByUserId: actorUserId,
	});
}

export async function currentChallenge(db: Db, sessionId: string) {
	return await db
		.select()
		.from(qrChallenges)
		.where(
			and(
				eq(qrChallenges.sessionId, sessionId),
				eq(qrChallenges.isCurrent, true),
			),
		);
}

export async function revokeSessionChallenge(
	db: Db,
	challengeId: string,
	now: Date,
) {
	return await db
		.update(qrChallenges)
		.set({ revokedAt: now })
		.where(eq(qrChallenges.id, challengeId));
}

export async function retireSessionChallenge(db: Db, challengeId: string) {
	return await db
		.update(qrChallenges)
		.set({ isCurrent: false })
		.where(eq(qrChallenges.id, challengeId));
}

export async function invalidateSessionChallenges(
	db: Db,
	sessionId: string,
	now: Date,
) {
	return await db
		.update(qrChallenges)
		.set({
			isCurrent: false,
			revokedAt: sql`coalesce(${qrChallenges.revokedAt}, ${now})`,
		})
		.where(
			and(
				eq(qrChallenges.sessionId, sessionId),
				eq(qrChallenges.isCurrent, true),
			),
		);
}

export async function closeInternalSession(
	db: Db,
	sessionId: string,
	now: Date,
) {
	return await db
		.update(attendanceSessions)
		.set({ status: "CLOSED", closedAt: now })
		.where(eq(attendanceSessions.id, sessionId));
}
