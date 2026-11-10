import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { TRPCError } from "@trpc/server";

import {
	type EventListInput,
	eventListSchema,
} from "../../contracts/attendance";

import { getCommitteeRoster } from "../../modules/committee/committee.public";

import * as eventOperations from "../../modules/events/events.public";
import { visibilityActions } from "../../modules/events/events.public";
import {
	canAccessPersonalSr,
	canManageInternalEvent,
	getActiveSrDirectory,
	hasSuperadminPrivilege,
} from "../../modules/identity/identity.public";
import {
	advancedEditMode,
	draftDeletionBlocker,
	operator,
	readEventContext,
} from "./context";

export async function listEvents(
	db: Database,
	identity: ActiveIdentity,
	input: EventListInput = { visibility: "NON_ARCHIVED" },
) {
	if (!canAccessPersonalSr(identity) && !hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const canManage = canManageInternalEvent(identity);
	const isSuperadmin = hasSuperadminPrivilege(identity);
	const filter = eventListSchema.parse(input);
	if (!isSuperadmin && filter.visibility !== "NON_ARCHIVED")
		throw new TRPCError({ code: "FORBIDDEN" });

	const rows = canManage
		? await eventOperations.listManagedEvents(db, filter)
		: await eventOperations.listInvitedEvents(db, identity.userId);
	return { canManage, isSuperadmin, events: rows };
}

export async function readEventDetail(
	db: Database | DatabaseTransaction,
	identity: ActiveIdentity,
	eventId: string,
) {
	if (!canAccessPersonalSr(identity) && !hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const [row] = await readEventContext(db, eventId);
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	const canManage = canManageInternalEvent(identity);
	if (!canManage) {
		if (row.event.visibility !== "VISIBLE")
			throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
		const [invited] = await eventOperations.invitationForUser(
			db,
			eventId,
			identity.userId,
		);
		if (row.event.status !== "PUBLISHED" || !invited)
			throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	}
	const participants = canManage
		? await eventOperations.invitationSnapshots(db, eventId)
		: [];
	const deletionBlockedReason = hasSuperadminPrivilege(identity)
		? await draftDeletionBlocker(db, row.event, row.session)
		: null;
	return {
		canManage,
		committeeName:
			row.event.snapshotCommitteeName ??
			(canManage && row.event.committeeId && row.event.status === "DRAFT"
				? (await getCommitteeRoster(db, row.event.committeeId)).name
				: null),
		administration: hasSuperadminPrivilege(identity)
			? {
					visibilityActions: visibilityActions(row.event, row.session),
					canDeleteDraft: deletionBlockedReason === null,
					deletionBlockedReason,
				}
			: null,
		advancedEditMode: hasSuperadminPrivilege(identity)
			? await advancedEditMode(db, row.event, row.session)
			: null,
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

export async function getEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	return db.transaction((tx) => readEventDetail(tx, identity, eventId), {
		isolationLevel: "repeatable read",
		accessMode: "read only",
	});
}
