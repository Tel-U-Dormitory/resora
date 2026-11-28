import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { TRPCError } from "@trpc/server";

import {
	type EventListInput,
	eventListSchema,
} from "../../contracts/attendance";

import { getCommitteeRoster } from "../../modules/committee/committee.public";
import { getActiveDtDirectory, getAllDtUserIds } from "../../modules/dt/dt.public";

import * as eventOperations from "../../modules/events/events.public";
import { isDtScopedCriteria, visibilityActions } from "../../modules/events/events.public";
import {
	canAccessPersonalDt,
	canAccessPersonalSr,
	canManageDt,
	canManageEventScoring,
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
	if (
		!canAccessPersonalSr(identity) &&
		!canAccessPersonalDt(identity) &&
		!canManageDt(identity) &&
		!hasSuperadminPrivilege(identity)
	)
		throw new TRPCError({ code: "FORBIDDEN" });
	const canManage = canManageInternalEvent(identity);
	const canManageDtEvents = canManageDt(identity);
	const isSuperadmin = hasSuperadminPrivilege(identity);
	const filter = eventListSchema.parse(input);
	if (!isSuperadmin && filter.visibility !== "NON_ARCHIVED")
		throw new TRPCError({ code: "FORBIDDEN" });

	const dtIds = canManage || canManageDtEvents ? await getAllDtUserIds(db) : new Set<string>();
	if (canManage) {
		const managed = await eventOperations.listManagedEvents(db, filter);
		const events = managed.map((ev) => ({
			...ev,
			isDtScoped: isDtScopedCriteria(
				ev.rosterCriteria,
				ev.organizationContext,
				dtIds,
			),
			isExternalCommitteeQr: false,
			canControlSession: true,
		}));
		return { canManage, canManageDtEvents, isSuperadmin, events };
	}

	const invited = await eventOperations.listInvitedEvents(db, identity.userId);
	if (!canManageDtEvents) {
		return {
			canManage,
			canManageDtEvents,
			isSuperadmin,
			events: invited.map((ev) => ({
				...ev,
				isDtScoped: false,
				isExternalCommitteeQr: false,
				canControlSession: false,
			})),
		};
	}

	const [managedCandidates, eventIdsWithDt] = await Promise.all([
		eventOperations.listManagedEvents(db, {
			visibility: "NON_ARCHIVED",
		}),
		eventOperations.listEventIdsWithDtParticipants(db),
	]);
	const dtManaged = managedCandidates
		.filter((ev) => {
			const ownDt = isDtScopedCriteria(
				ev.rosterCriteria,
				ev.organizationContext,
				dtIds,
			);
			const externalDtMirror =
				ev.status === "PUBLISHED" &&
				ev.visibility === "VISIBLE" &&
				(Boolean(ev.rosterCriteria.allDt) || eventIdsWithDt.has(ev.id));
			return ownDt || externalDtMirror;
		})
		.map((ev) => {
			const ownDt = isDtScopedCriteria(
				ev.rosterCriteria,
				ev.organizationContext,
				dtIds,
			);
			return {
				id: ev.id,
				title: ev.title,
				description: ev.description,
				status: ev.status,
				startsAt: ev.startsAt,
				endsAt: ev.endsAt,
				visibility: ev.visibility,
				isDtScoped: true,
				isExternalCommitteeQr: !ownDt,
				canControlSession: ownDt,
			};
		});
	const dtIdsSet = new Set(dtManaged.map((ev) => ev.id));
	const merged = [
		...dtManaged,
		...invited
			.filter((ev) => !dtIdsSet.has(ev.id))
			.map((ev) => ({
				...ev,
				isDtScoped: false,
				isExternalCommitteeQr: false,
				canControlSession: false,
			})),
	].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
	return { canManage, canManageDtEvents, isSuperadmin, events: merged };
}

export async function readEventDetail(
	db: Database | DatabaseTransaction,
	identity: ActiveIdentity,
	eventId: string,
) {
	if (
		!canAccessPersonalSr(identity) &&
		!canAccessPersonalDt(identity) &&
		!canManageDt(identity) &&
		!hasSuperadminPrivilege(identity)
	)
		throw new TRPCError({ code: "FORBIDDEN" });
	const [row] = await readEventContext(db, eventId);
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	const canManageFull = canManageInternalEvent(identity);
	const dtIds =
		canManageFull || canManageDt(identity)
			? await getAllDtUserIds(db)
			: new Set<string>();
	const isDtOnlyEvent = isDtScopedCriteria(
		row.event.rosterCriteria,
		row.event.organizationContext,
		dtIds,
	);
	const canManageDtScope = !canManageFull && canManageDt(identity) && isDtOnlyEvent;
	const canManage = canManageFull || canManageDtScope;
	const participants = canManage
		? await eventOperations.invitationSnapshots(db, eventId)
		: [];
	const hasDtParticipants =
		Boolean(row.event.rosterCriteria.allDt) ||
		(canManage
			? participants.some((p) => p.positionCode === "DT")
			: canManageDt(identity) &&
				row.event.status === "PUBLISHED" &&
				row.event.visibility === "VISIBLE" &&
				(await eventOperations.eventHasDtParticipants(db, eventId)));
	const canViewDtQr =
		canManage ||
		(canManageDt(identity) &&
			row.event.status === "PUBLISHED" &&
			row.event.visibility === "VISIBLE" &&
			hasDtParticipants);
	const [invited] = !canManage
		? await eventOperations.invitationForUser(db, eventId, identity.userId)
		: [];
	if (!canManage && !canViewDtQr) {
		if (row.event.visibility !== "VISIBLE")
			throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
		if (row.event.status !== "PUBLISHED" || !invited)
			throw new TRPCError({ code: "NOT_FOUND", message: "Event unavailable" });
	}
	const deletionBlockedReason = hasSuperadminPrivilege(identity)
		? await draftDeletionBlocker(db, row.event, row.session)
		: null;
	return {
		canManage,
		canViewDtQr,
		isInvited: Boolean(invited),
		hasSrAudience: !isDtOnlyEvent,
		hasDtAudience: isDtOnlyEvent || hasDtParticipants,
		committeeName:
			row.event.snapshotCommitteeName ??
			(canManage && row.event.committeeId && row.event.status === "DRAFT"
				? (await getCommitteeRoster(db, row.event.committeeId)).name
				: null),
		canManageScoringMode:
			canManageEventScoring(identity) && row.event.status !== "DRAFT",
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
	if (!canManageInternalEvent(identity)) {
		const dtCandidates = await getActiveDtDirectory(db);
		return {
			candidates: [],
			invalidAssignmentCount: 0,
			dtCandidates: dtCandidates.map(eventOperations.dtCandidateToRosterCandidate),
		};
	}
	const [srDirectory, dtCandidates] = await Promise.all([
		getActiveSrDirectory(db),
		getActiveDtDirectory(db),
	]);
	return {
		...srDirectory,
		dtCandidates: dtCandidates.map(eventOperations.dtCandidateToRosterCandidate),
	};
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
