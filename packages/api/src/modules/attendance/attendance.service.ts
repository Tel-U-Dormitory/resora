import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	attendanceSessions,
	eventParticipants,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import {
	canAccessPersonalSr,
	canManageInternalEvent,
	getActiveSrDirectory,
	getLiveOperationalIdentity,
	hasSuperadminPrivilege,
} from "../identity/identity.public";
import type { EventDraft } from "./attendance.schema";
import { signChallenge } from "./qr";
import { resolveRoster } from "./roster";

function operator(identity: ActiveIdentity | null) {
	if (!canManageInternalEvent(identity))
		throw new TRPCError({ code: "FORBIDDEN", message: "HCO access required" });
}
async function lockedEvent(
	tx: DatabaseTransaction,
	eventId: string,
	identity: ActiveIdentity,
) {
	const [event] = await tx
		.select()
		.from(events)
		.where(eq(events.id, eventId))
		.for("update");
	if (!event)
		throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	const [session] = await tx
		.select()
		.from(attendanceSessions)
		.where(eq(attendanceSessions.internalEventId, eventId))
		.for("update");
	if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	operator(await getLiveOperationalIdentity(tx, identity.userId));
	return { event, session };
}
function requireState(actual: string, expected: string) {
	if (actual !== expected)
		throw new TRPCError({
			code: "CONFLICT",
			message: "Event/session state does not permit this action",
		});
}
export async function createEvent(
	db: Database,
	identity: ActiveIdentity,
	draft: EventDraft,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		operator(await getLiveOperationalIdentity(tx, identity.userId));
		const [event] = await tx
			.insert(events)
			.values({
				title: draft.title,
				description: draft.description,
				createdByUserId: identity.userId,
				startsAt: new Date(draft.startsAt),
				endsAt: new Date(draft.endsAt),
				rosterCriteria: draft.rosterCriteria,
			})
			.returning();
		if (!event) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		await tx
			.insert(attendanceSessions)
			.values({ internalEventId: event.id, ...draft.session });
		return { eventId: event.id };
	});
}
export async function editDraft(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	draft: EventDraft,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		await lockedEvent(tx, eventId, identity).then(({ event }) =>
			requireState(event.status, "DRAFT"),
		);
		await tx
			.update(events)
			.set({
				title: draft.title,
				description: draft.description,
				startsAt: new Date(draft.startsAt),
				endsAt: new Date(draft.endsAt),
				rosterCriteria: draft.rosterCriteria,
			})
			.where(eq(events.id, eventId));
		await tx
			.update(attendanceSessions)
			.set(draft.session)
			.where(eq(attendanceSessions.internalEventId, eventId));
	});
}
export async function editMetadata(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	metadata: { title: string; description: string },
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "PUBLISHED");
		await tx.update(events).set(metadata).where(eq(events.id, eventId));
	});
}
export async function listEvents(db: Database, identity: ActiveIdentity) {
	if (!canAccessPersonalSr(identity) && !hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const canManage = canManageInternalEvent(identity);
	const selection = {
		id: events.id,
		title: events.title,
		description: events.description,
		status: events.status,
		startsAt: events.startsAt,
		endsAt: events.endsAt,
	};
	const rows = canManage
		? await db.select(selection).from(events).orderBy(desc(events.startsAt))
		: await db
				.select(selection)
				.from(events)
				.innerJoin(eventParticipants, eq(eventParticipants.eventId, events.id))
				.where(
					and(
						eq(events.status, "PUBLISHED"),
						eq(eventParticipants.userId, identity.userId),
					),
				)
				.orderBy(desc(events.startsAt));
	return { canManage, events: rows };
}
export async function getEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	if (!canAccessPersonalSr(identity) && !hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const [row] = await db
		.select({ event: events, session: attendanceSessions })
		.from(events)
		.innerJoin(
			attendanceSessions,
			eq(attendanceSessions.internalEventId, events.id),
		)
		.where(eq(events.id, eventId));
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	const canManage = canManageInternalEvent(identity);
	if (!canManage) {
		const [invited] = await db
			.select({ userId: eventParticipants.userId })
			.from(eventParticipants)
			.where(
				and(
					eq(eventParticipants.eventId, eventId),
					eq(eventParticipants.userId, identity.userId),
				),
			);
		if (row.event.status !== "PUBLISHED" || !invited)
			throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	}
	const participants = canManage
		? await db
				.select()
				.from(eventParticipants)
				.where(eq(eventParticipants.eventId, eventId))
		: [];
	return {
		canManage,
		event: {
			...row.event,
			rosterCriteria: canManage ? row.event.rosterCriteria : null,
		},
		session: row.session,
		participants,
	};
}
export async function getRosterDirectory(
	db: Database,
	identity: ActiveIdentity,
) {
	operator(identity);
	return getActiveSrDirectory(db);
}
export async function previewRoster(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	const [event] = await db.select().from(events).where(eq(events.id, eventId));
	if (!event) throw new TRPCError({ code: "NOT_FOUND" });
	requireState(event.status, "DRAFT");
	const directory = await getActiveSrDirectory(db);
	return {
		participants: resolveRoster(directory.candidates, event.rosterCriteria),
		invalidAssignmentCount: directory.invalidAssignmentCount,
	};
}
export async function publishEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "DRAFT");
		requireState(session.status, "INACTIVE");
		const directory = await getActiveSrDirectory(tx, true);
		const roster = resolveRoster(directory.candidates, event.rosterCriteria);
		if (roster.length)
			await tx.insert(eventParticipants).values(
				roster.map((sr) => ({
					eventId,
					userId: sr.userId,
					nim: sr.nim,
					name: sr.name,
					departmentCode: sr.departmentCode,
					positionCode: sr.positionCode,
					buildingCode: sr.buildingCode,
					buildingName: sr.buildingName,
				})),
			);
		await tx
			.update(events)
			.set({ status: "PUBLISHED", publishedAt: new Date() })
			.where(eq(events.id, eventId));
		return {
			participantCount: roster.length,
			invalidAssignmentCount: directory.invalidAssignmentCount,
		};
	});
}
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
		const now = new Date();
		await tx
			.update(attendanceSessions)
			.set({ status: "ACTIVE", activatedAt: now })
			.where(eq(attendanceSessions.id, session.id));
		await tx.insert(qrChallenges).values({
			sessionId: session.id,
			activatedAt: now,
			expiresAt: new Date(now.getTime() + session.qrTtlMinutes * 60_000),
			issuedByUserId: identity.userId,
		});
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
		const [current] = await tx
			.select()
			.from(qrChallenges)
			.where(
				and(
					eq(qrChallenges.sessionId, session.id),
					eq(qrChallenges.isCurrent, true),
				),
			);
		const now = new Date();
		if (action === "revoke") {
			if (current && !current.revokedAt)
				await tx
					.update(qrChallenges)
					.set({ revokedAt: now })
					.where(eq(qrChallenges.id, current.id));
			return;
		}
		if (current && !current.revokedAt && current.expiresAt > now)
			throw new TRPCError({
				code: "CONFLICT",
				message: "Revoke or wait for expiry before reissue",
			});
		if (current)
			await tx
				.update(qrChallenges)
				.set({ isCurrent: false })
				.where(eq(qrChallenges.id, current.id));
		await tx.insert(qrChallenges).values({
			sessionId: session.id,
			activatedAt: now,
			expiresAt: new Date(now.getTime() + session.qrTtlMinutes * 60_000),
			issuedByUserId: identity.userId,
		});
	});
}
export async function closeEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "PUBLISHED");
		const now = new Date();
		await tx
			.update(qrChallenges)
			.set({
				isCurrent: false,
				revokedAt: sql`coalesce(${qrChallenges.revokedAt}, ${now})`,
			})
			.where(
				and(
					eq(qrChallenges.sessionId, session.id),
					eq(qrChallenges.isCurrent, true),
				),
			);
		await tx
			.update(attendanceSessions)
			.set({ status: "CLOSED", closedAt: now })
			.where(eq(attendanceSessions.id, session.id));
		await tx
			.update(events)
			.set({ status: "CLOSED", closedAt: now })
			.where(eq(events.id, eventId));
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
	const [challenge] = await db
		.select()
		.from(qrChallenges)
		.where(
			and(
				eq(qrChallenges.sessionId, row.session.id),
				eq(qrChallenges.isCurrent, true),
			),
		);
	if (!challenge)
		return { state: "NONE" as const, expiresAt: null, image: null };
	const state = challenge.revokedAt
		? "REVOKED"
		: challenge.expiresAt <= new Date()
			? "EXPIRED"
			: row.session.status !== "ACTIVE"
				? "INACTIVE"
				: "ACTIVE";
	const token =
		state === "ACTIVE"
			? signChallenge(secret, row.session.id, challenge.id)
			: null;
	return {
		state,
		expiresAt: challenge.expiresAt,
		image: token
			? await QRCode.toDataURL(token, { width: 320, errorCorrectionLevel: "M" })
			: null,
	};
}
