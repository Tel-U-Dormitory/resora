import type { Database, DatabaseTransaction } from "@resora/db";
import {
	attendanceAuditLogs,
	attendanceRecords,
	attendanceSessions,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { and, eq, sql } from "drizzle-orm";

import type { SessionFact } from "../session.types";

type Db = Database | DatabaseTransaction;
const sessionFields = {
	id: attendanceSessions.id,
	internalEventId: attendanceSessions.internalEventId,
	status: attendanceSessions.status,
	centerLat: attendanceSessions.centerLat,
	centerLng: attendanceSessions.centerLng,
	geofenceRadiusM: attendanceSessions.geofenceRadiusM,
	lateGraceMinutes: attendanceSessions.lateGraceMinutes,
	qrTtlMinutes: attendanceSessions.qrTtlMinutes,
	activatedAt: attendanceSessions.activatedAt,
	closedAt: attendanceSessions.closedAt,
};

export async function lockInternalSession(
	db: Db,
	eventId: string,
): Promise<SessionFact[]> {
	return await db
		.select(sessionFields)
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

export async function sessionHasDeletionReferences(db: Db, sessionId: string) {
	return await db
		.select({
			hasReferences: sql<boolean>`EXISTS (SELECT 1 FROM ${attendanceRecords} WHERE ${attendanceRecords.sessionId} = ${sessionId}) OR EXISTS (SELECT 1 FROM ${qrChallenges} WHERE ${qrChallenges.sessionId} = ${sessionId}) OR EXISTS (SELECT 1 FROM ${attendanceAuditLogs} WHERE ${attendanceAuditLogs.sessionId} = ${sessionId})`,
		})
		.from(attendanceSessions)
		.where(eq(attendanceSessions.id, sessionId));
}

export async function readInternalSession(
	db: Db,
	eventId: string,
): Promise<SessionFact[]> {
	return await db
		.select(sessionFields)
		.from(attendanceSessions)
		.where(eq(attendanceSessions.internalEventId, eventId));
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
