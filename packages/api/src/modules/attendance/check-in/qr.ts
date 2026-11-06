import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	attendanceSessions,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { eq } from "drizzle-orm";

function signature(secret: string, payload: string) {
	if (secret.length < 32)
		throw new Error("QR signing configuration unavailable");
	const key = Buffer.from(
		hkdfSync("sha256", secret, "resora", "attendance-qr-v1", 32),
	);
	return createHmac("sha256", key).update(payload).digest("hex");
}
export function signChallenge(
	secret: string,
	sessionId: string,
	challengeId: string,
) {
	const payload = `resora:v1:${sessionId}:${challengeId}`;
	return `${payload}:${signature(secret, payload)}`;
}
export function parseChallenge(
	secret: string,
	token: string,
	expectedSessionId: string,
) {
	const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
	const match = new RegExp(
		`^resora:v1:(${uuid}):(${uuid}):([0-9a-f]{64})$`,
	).exec(token);
	if (!match || match[1] !== expectedSessionId || !match[2] || !match[3])
		return null;
	const payload = `resora:v1:${match[1]}:${match[2]}`;
	const expected = Buffer.from(signature(secret, payload), "hex");
	if (!timingSafeEqual(expected, Buffer.from(match[3], "hex"))) return null;
	return match[2];
}

// QR validity only; Phase 5 must additionally enforce live identity, invitation and geofence.
export async function verifySessionChallenge(
	db: Database | DatabaseTransaction,
	secret: string,
	input: { sessionId: string; token: string },
	now = new Date(),
) {
	const id = parseChallenge(secret, input.token, input.sessionId);
	if (!id) return null;
	const [row] = await db
		.select({
			challenge: qrChallenges,
			session: attendanceSessions,
			event: events,
		})
		.from(qrChallenges)
		.innerJoin(
			attendanceSessions,
			eq(attendanceSessions.id, qrChallenges.sessionId),
		)
		.innerJoin(events, eq(events.id, attendanceSessions.internalEventId))
		.where(eq(qrChallenges.id, id));
	if (
		!row ||
		row.session.id !== input.sessionId ||
		row.event.status !== "PUBLISHED" ||
		row.session.status !== "ACTIVE" ||
		!row.challenge.isCurrent ||
		row.challenge.revokedAt ||
		row.challenge.activatedAt > now ||
		row.challenge.expiresAt <= now
	)
		return null;
	return {
		sessionId: row.session.id,
		internalEventId: row.event.id,
		challengeId: row.challenge.id,
		startsAt: row.event.startsAt,
		centerLat: row.session.centerLat,
		centerLng: row.session.centerLng,
		geofenceRadiusM: row.session.geofenceRadiusM,
		lateGraceMinutes: row.session.lateGraceMinutes,
	};
}
