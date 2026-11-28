import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { TRPCError } from "@trpc/server";
import QRCode from "qrcode";

import * as attendanceOperations from "../../modules/attendance/attendance.public";
import { signChallenge } from "../../modules/attendance/attendance.public";
import { canManageInternalEvent } from "../../modules/identity/identity.public";
import { lockedEvent, operator, requireState } from "./context";
import { getEvent } from "./queries";

export async function activateSession(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "PUBLISHED");
		requireState(session.status, "INACTIVE");
		if (event.visibility !== "VISIBLE")
			throw new TRPCError({
				code: "CONFLICT",
				message: "HIDDEN_EVENT_ACTIVATION_FORBIDDEN",
			});
		const now = new Date();
		await attendanceOperations.activateInternalSession(tx, session.id, now);
		await attendanceOperations.issueSessionChallenge(
			tx,
			session,
			now,
			identity.userId,
		);
	});
}

export async function changeQr(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	action: "revoke" | "reissue",
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "PUBLISHED");
		requireState(session.status, "ACTIVE");
		const [current] = await attendanceOperations.currentChallenge(
			tx,
			session.id,
		);
		const now = new Date();
		if (action === "revoke") {
			if (current && !current.revokedAt)
				await attendanceOperations.revokeSessionChallenge(tx, current.id, now);
			return;
		}
		if (current && !current.revokedAt && current.expiresAt > now)
			throw new TRPCError({
				code: "CONFLICT",
				message: "Revoke or wait for expiry before reissue",
			});
		if (current)
			await attendanceOperations.retireSessionChallenge(tx, current.id);
		await attendanceOperations.issueSessionChallenge(
			tx,
			session,
			now,
			identity.userId,
		);
	});
}

export async function getQr(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	secret: string,
) {
	operator(identity);
	const row = await getEvent(db, identity, eventId);
	if (!row.canViewDtQr) {
		throw new TRPCError({ code: "FORBIDDEN", message: "HCO access required" });
	}
	const isFullManager = canManageInternalEvent(identity);
	const canControlSession = row.canManage;
	const [challenge] = await attendanceOperations.currentChallenge(
		db,
		row.session.id,
	);
	if (!challenge)
		return {
			state: "NONE" as const,
			expiresAt: null,
			image: null,
			srImage: null,
			dtImage: null,
			canControlSession,
		};
	const state = challenge.revokedAt
		? "REVOKED"
		: challenge.expiresAt <= new Date()
			? "EXPIRED"
			: row.session.status !== "ACTIVE"
				? "INACTIVE"
				: "ACTIVE";
	const srToken =
		state === "ACTIVE" && isFullManager && row.hasSrAudience
			? signChallenge(secret, row.session.id, challenge.id, "SR")
			: null;
	const dtToken =
		state === "ACTIVE" &&
		(row.hasDtAudience || (!row.hasSrAudience && !isFullManager))
			? signChallenge(secret, row.session.id, challenge.id, "DT")
			: null;
	const [srImage, dtImage] = await Promise.all([
		srToken
			? QRCode.toDataURL(srToken, { width: 320, errorCorrectionLevel: "M" })
			: Promise.resolve(null),
		dtToken
			? QRCode.toDataURL(dtToken, { width: 320, errorCorrectionLevel: "M" })
			: Promise.resolve(null),
	]);
	return {
		state,
		expiresAt: challenge.expiresAt,
		image: srImage ?? dtImage,
		srImage,
		dtImage,
		canControlSession,
	};
}
