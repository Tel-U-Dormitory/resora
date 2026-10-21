import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	attendanceRecords,
	attendanceSessions,
	eventParticipants,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
	canAccessPersonalSr,
	getCheckInSr,
	isValidSrAssignment,
} from "../identity/identity.public";
import type { CheckInInput } from "./attendance.schema";
import { classifyTiming, locationFailure } from "./check-in-policy";
import { parseChallenge, verifySessionChallenge } from "./qr";

function denied(message: string): never {
	throw new TRPCError({ code: "FORBIDDEN", message });
}

export async function checkIn(
	db: Database,
	identity: ActiveIdentity,
	secret: string,
	input: CheckInInput,
) {
	if (
		!canAccessPersonalSr(identity) ||
		!isValidSrAssignment(identity.departmentCode, identity.positionCode)
	)
		denied("NOT_ELIGIBLE");
	const sessionId = input.qrToken.split(":")[2];
	const challengeId = sessionId
		? parseChallenge(secret, input.qrToken, sessionId)
		: null;
	if (!sessionId || !challengeId) denied("INVALID_QR");
	return db.transaction(async (tx) => {
		const [binding] = await tx
			.select({ eventId: attendanceSessions.internalEventId })
			.from(attendanceSessions)
			.where(eq(attendanceSessions.id, sessionId));
		if (!binding) denied("INVALID_QR");
		// Shared locks allow independent check-ins, but block administrative state/QR
		// changes through lockedEvent(). Keep event -> session order; never upgrade here.
		const [event] = await tx
			.select()
			.from(events)
			.where(eq(events.id, binding.eventId))
			.for("share");
		const [session] = await tx
			.select()
			.from(attendanceSessions)
			.where(eq(attendanceSessions.id, sessionId))
			.for("share");
		if (!event || !session || session.internalEventId !== event.id)
			denied("INVALID_QR");
		if (event.status === "CLOSED" || session.status === "CLOSED")
			denied("SESSION_CLOSED");
		if (event.status !== "PUBLISHED" || session.status !== "ACTIVE")
			denied("SESSION_INACTIVE");
		// Re-read/lock live eligibility through Identity's public interface, not cached client claims.
		if (!(await getCheckInSr(tx, identity.userId))) denied("NOT_ELIGIBLE");
		const [invitation] = await tx
			.select({ userId: eventParticipants.userId })
			.from(eventParticipants)
			.where(
				and(
					eq(eventParticipants.eventId, event.id),
					eq(eventParticipants.userId, identity.userId),
				),
			);
		if (!invitation) denied("NOT_INVITED");
		const now = new Date(); // After lock waits; never a client timestamp or scheduled-end cutoff.
		const verified = await verifySessionChallenge(
			tx,
			secret,
			{ sessionId, token: input.qrToken },
			now,
		);
		if (!verified) {
			const [challenge] = await tx
				.select()
				.from(qrChallenges)
				.where(eq(qrChallenges.id, challengeId));
			if (challenge?.sessionId !== sessionId) denied("INVALID_QR");
			if (!challenge.isCurrent || challenge.revokedAt) denied("QR_REVOKED");
			if (challenge.expiresAt <= now) denied("QR_EXPIRED");
			denied("INVALID_QR");
		}
		const failure = locationFailure(
			input.location,
			{ latitude: verified.centerLat, longitude: verified.centerLng },
			verified.geofenceRadiusM,
		);
		if (failure) denied(failure);
		// Explicit DTOs: never return GPS, raw token, recorder or internal challenge metadata.
		const fields = {
			attendanceAt: attendanceRecords.attendanceAt,
			timingClass: attendanceRecords.timingClass,
		};
		const match = and(
			eq(attendanceRecords.sessionId, sessionId),
			eq(attendanceRecords.userId, identity.userId),
		);
		const [existing] = await tx
			.select(fields)
			.from(attendanceRecords)
			.where(match);
		if (existing)
			return {
				status: "ALREADY_CHECKED_IN" as const,
				eventName: event.title,
				...existing,
			};
		const [created] = await tx
			.insert(attendanceRecords)
			.values({
				sessionId,
				userId: identity.userId,
				attendanceAt: now,
				recordedAt: now,
				updatedAt: now,
				source: "QR",
				timingClass: classifyTiming(
					now,
					verified.startsAt,
					verified.lateGraceMinutes,
				),
				recordedByUserId: identity.userId,
				scanLat: input.location.latitude,
				scanLng: input.location.longitude,
				gpsAccuracyM: input.location.accuracyMeters,
			})
			.onConflictDoNothing({
				target: [attendanceRecords.sessionId, attendanceRecords.userId],
			})
			.returning(fields);
		if (created)
			return {
				status: "CHECKED_IN" as const,
				eventName: event.title,
				...created,
			};
		const [duplicate] = await tx
			.select(fields)
			.from(attendanceRecords)
			.where(match);
		if (!duplicate) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		return {
			status: "ALREADY_CHECKED_IN" as const,
			eventName: event.title,
			...duplicate,
		};
	});
}
