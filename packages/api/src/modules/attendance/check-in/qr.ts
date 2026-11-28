import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { Database, DatabaseTransaction } from "@resora/db";
import { attendanceSessions, qrChallenges } from "@resora/db/schema/attendance";
import { eq } from "drizzle-orm";
import { readEvent } from "../../events/events.public";

export type QrChannel = "ALL" | "SR" | "DT";

function signature(secret: string, payload: string) {
	if (secret.length < 32)
		throw new Error("QR signing configuration unavailable");
	const key = Buffer.from(
		hkdfSync("sha256", secret, "resora", "attendance-qr-v1", 32),
	);
	return createHmac("sha256", key).update(payload).digest("hex");
}

export function extractSessionIdFromToken(token: string) {
	const parts = token.split(":");
	if (parts.length === 5 && parts[0] === "resora" && parts[1] === "v1") {
		return parts[2] ?? null;
	}
	if (
		parts.length === 6 &&
		parts[0] === "resora" &&
		parts[1] === "v1" &&
		(parts[2] === "sr" || parts[2] === "dt")
	) {
		return parts[3] ?? null;
	}
	return null;
}

export function signChallenge(
	secret: string,
	sessionId: string,
	challengeId: string,
	channel: QrChannel = "ALL",
) {
	const prefix =
		channel === "ALL" ? "resora:v1" : `resora:v1:${channel.toLowerCase()}`;
	const payload = `${prefix}:${sessionId}:${challengeId}`;
	return `${payload}:${signature(secret, payload)}`;
}

export function parseChallengeWithChannel(
	secret: string,
	token: string,
	expectedSessionId: string,
): { challengeId: string; channel: QrChannel } | null {
	const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
	const match = new RegExp(
		`^resora:v1:(?:(sr|dt):)?(${uuid}):(${uuid}):([0-9a-f]{64})$`,
	).exec(token);
	if (!match || match[2] !== expectedSessionId || !match[3] || !match[4])
		return null;
	const scopeTag = match[1];
	const channel: QrChannel =
		scopeTag === "sr" ? "SR" : scopeTag === "dt" ? "DT" : "ALL";
	const payload = scopeTag
		? `resora:v1:${scopeTag}:${match[2]}:${match[3]}`
		: `resora:v1:${match[2]}:${match[3]}`;
	const expected = Buffer.from(signature(secret, payload), "hex");
	if (!timingSafeEqual(expected, Buffer.from(match[4], "hex"))) return null;
	return { challengeId: match[3], channel };
}

export function parseChallenge(
	secret: string,
	token: string,
	expectedSessionId: string,
) {
	return (
		parseChallengeWithChannel(secret, token, expectedSessionId)?.challengeId ??
		null
	);
}

// QR validity only; Phase 5 must additionally enforce live identity, invitation and geofence.
export async function verifySessionChallenge(
	db: Database | DatabaseTransaction,
	secret: string,
	input: { sessionId: string; token: string },
	now = new Date(),
) {
	const parsed = parseChallengeWithChannel(secret, input.token, input.sessionId);
	if (!parsed) return null;
	const { challengeId: id, channel } = parsed;
	const [row] = await db
		.select({
			challenge: qrChallenges,
			session: attendanceSessions,
		})
		.from(qrChallenges)
		.innerJoin(
			attendanceSessions,
			eq(attendanceSessions.id, qrChallenges.sessionId),
		)
		.where(eq(qrChallenges.id, id));
	if (!row) return null;
	const [event] = await readEvent(db, row.session.internalEventId);
	if (
		!event ||
		row.session.id !== input.sessionId ||
		event.status !== "PUBLISHED" ||
		row.session.status !== "ACTIVE" ||
		!row.challenge.isCurrent ||
		row.challenge.revokedAt ||
		row.challenge.activatedAt > now ||
		row.challenge.expiresAt <= now
	)
		return null;
	return {
		sessionId: row.session.id,
		internalEventId: event.id,
		challengeId: row.challenge.id,
		channel,
		startsAt: event.startsAt,
		centerLat: row.session.centerLat,
		centerLng: row.session.centerLng,
		geofenceRadiusM: row.session.geofenceRadiusM,
		lateGraceMinutes: row.session.lateGraceMinutes,
	};
}
