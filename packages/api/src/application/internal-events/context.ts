import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { TRPCError } from "@trpc/server";

import type { SessionFact } from "../../modules/attendance/attendance.public";
import * as attendanceOperations from "../../modules/attendance/attendance.public";

import { getCommitteeRoster } from "../../modules/committee/committee.public";
import type { EventFact } from "../../modules/events/events.public";
import * as eventOperations from "../../modules/events/events.public";

import {
	canManageInternalEvent,
	getLiveOperationalIdentity,
	hasSuperadminPrivilege,
} from "../../modules/identity/identity.public";

export async function lockedRosterEvent(
	tx: DatabaseTransaction,
	eventId: string,
	identity: ActiveIdentity,
	newCommitteeId?: string | null,
	superadminOnly = false,
) {
	const [hint] = await eventOperations.eventOrganizationHint(tx, eventId);
	if (!hint) throw new TRPCError({ code: "NOT_FOUND" });
	const committees = new Map<
		string,
		Awaited<ReturnType<typeof getCommitteeRoster>>
	>();
	for (const id of [
		...new Set(
			[hint.committeeId, newCommitteeId].filter((id): id is string =>
				Boolean(id),
			),
		),
	].sort())
		committees.set(id, await getCommitteeRoster(tx, id, true));
	const locked = await lockedEvent(tx, eventId, identity, superadminOnly);
	if ((locked.event.committeeId ?? null) !== (hint.committeeId ?? null))
		throw new TRPCError({
			code: "CONFLICT",
			message: "EVENT_ORGANIZATION_CHANGED",
		});
	return {
		...locked,
		committee: locked.event.committeeId
			? committees.get(locked.event.committeeId)
			: undefined,
	};
}

export function operator(identity: ActiveIdentity | null) {
	if (!canManageInternalEvent(identity))
		throw new TRPCError({ code: "FORBIDDEN", message: "HCO access required" });
}

export async function lockedEvent(
	tx: DatabaseTransaction,
	eventId: string,
	identity: ActiveIdentity,
	superadminOnly = false,
) {
	const [event] = await eventOperations.lockEventForManagement(tx, eventId);
	if (!event)
		throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	const [session] = await attendanceOperations.lockInternalSession(tx, eventId);
	if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	const live = await getLiveOperationalIdentity(tx, identity.userId);
	if (superadminOnly) {
		if (!hasSuperadminPrivilege(live))
			throw new TRPCError({ code: "FORBIDDEN" });
	} else operator(live);
	return { event, session };
}

export async function advancedEditMode(
	db: Database | DatabaseTransaction,
	event: EventFact,
	session: SessionFact,
) {
	if (event.status === "CLOSED" && session.status === "CLOSED")
		return "METADATA" as const;
	if (event.status !== "PUBLISHED") return null;
	if (session.status === "ACTIVE") return "LIMITED" as const;
	if (session.status !== "INACTIVE") return null;
	const [record] = await attendanceOperations.recordExistsForSession(
		db,
		session.id,
	);
	return record ? ("LIMITED" as const) : ("FULL" as const);
}

export function sessionConfiguration(session: SessionFact) {
	const {
		centerLat,
		centerLng,
		geofenceRadiusM,
		lateGraceMinutes,
		qrTtlMinutes,
	} = session;
	return {
		centerLat,
		centerLng,
		geofenceRadiusM,
		lateGraceMinutes,
		qrTtlMinutes,
	};
}

export function requireState(actual: string, expected: string) {
	if (actual !== expected)
		throw new TRPCError({
			code: "CONFLICT",
			message: "Event/session state does not permit this action",
		});
}

export async function draftDeletionBlocker(
	db: Database | DatabaseTransaction,
	event: EventFact,
	session: SessionFact,
) {
	if (event.status !== "DRAFT") return "DRAFT_REQUIRED" as const;
	if (
		event.visibility !== "VISIBLE" ||
		session.status !== "INACTIVE" ||
		session.activatedAt ||
		session.closedAt
	)
		return "UNUSED_SESSION_REQUIRED" as const;
	// One bounded existence query covers every current operational/audit FK.
	// Parent row locks also block concurrent FK insertions; FKs remain the final guard.
	const [references] = await deletionReferences(db, event.id, session.id);
	return references?.hasReferences === false
		? null
		: ("REFERENCES_EXIST" as const);
}

export async function readEventContext(
	db: Database | DatabaseTransaction,
	eventId: string,
) {
	const [event] = await eventOperations.readEvent(db, eventId);
	if (!event) return [];
	const [session] = await attendanceOperations.readInternalSession(db, eventId);
	return session ? [{ event, session }] : [];
}

export async function deletionReferences(
	db: Database | DatabaseTransaction,
	eventId: string,
	sessionId: string,
) {
	const [event] = await eventOperations.eventHasDeletionReferences(db, eventId);
	const [session] = await attendanceOperations.sessionHasDeletionReferences(
		db,
		sessionId,
	);
	return [
		{
			hasReferences:
				event?.hasReferences !== false || session?.hasReferences !== false,
		},
	];
}
