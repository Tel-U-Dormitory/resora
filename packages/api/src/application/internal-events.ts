import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { TRPCError } from "@trpc/server";
import QRCode from "qrcode";
import {
	type AdvancedEventEdit,
	advancedEventEditSchema,
	type DeleteDraftInput,
	deleteDraftSchema,
	type EventDraft,
	type EventListInput,
	type EventVisibilityInput,
	eventDraftSchema,
	eventListSchema,
	eventVisibilitySchema,
	type VisibilityAction,
} from "../contracts/attendance";
import type { SessionFact } from "../modules/attendance/attendance.public";
import * as attendanceOperations from "../modules/attendance/attendance.public";
import { signChallenge } from "../modules/attendance/attendance.public";
import { getCommitteeRoster } from "../modules/committee/committee.public";
import type {
	EventEditAuditState,
	EventFact,
	RosterCriteria,
} from "../modules/events/events.public";
import * as eventOperations from "../modules/events/events.public";
import {
	resolveCommitteeRoster,
	resolveRoster,
} from "../modules/events/events.public";
import {
	canAccessPersonalSr,
	canManageInternalEvent,
	getActiveSrDirectory,
	getLiveOperationalIdentity,
	hasSuperadminPrivilege,
} from "../modules/identity/identity.public";

async function lockedRosterEvent(
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

function operator(identity: ActiveIdentity | null) {
	if (!canManageInternalEvent(identity))
		throw new TRPCError({ code: "FORBIDDEN", message: "HCO access required" });
}
async function lockedEvent(
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

async function advancedEditMode(
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

function sameRoster(left: RosterCriteria, right: RosterCriteria) {
	const normalize = (criteria: RosterCriteria) => ({
		allSr: criteria.allSr,
		inti: criteria.inti,
		kadep: criteria.kadep,
		departments: [...new Set(criteria.departments)].sort(),
		individuals: [...new Set(criteria.individuals)].sort(),
		include: [...new Set(criteria.include)].sort(),
		exclude: [...new Set(criteria.exclude)].sort(),
	});
	return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function sessionConfiguration(session: SessionFact) {
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

export async function advancedEditEvent(
	db: Database,
	identity: ActiveIdentity,
	input: AdvancedEventEdit,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = advancedEventEditSchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid advanced event edit",
		});
	const data = parsed.data;
	return db.transaction(async (tx) => {
		const locked =
			data.mode === "FULL"
				? await lockedRosterEvent(
						tx,
						data.eventId,
						identity,
						data.draft.committeeId,
						true,
					)
				: {
						...(await lockedEvent(tx, data.eventId, identity, true)),
						committee: undefined,
					};
		const { event, session, committee } = locked;
		const mode = await advancedEditMode(tx, event, session);
		if (!mode || (data.mode === "FULL" && mode !== "FULL"))
			throw new TRPCError({
				code: "CONFLICT",
				message: "ADVANCED_EDIT_STATE_CHANGED",
			});
		const before: EventEditAuditState = {
			title: event.title,
			description: event.description,
			startsAt: event.startsAt.toISOString(),
			endsAt: event.endsAt.toISOString(),
		};
		const after: EventEditAuditState = { ...before };
		if (data.mode === "FULL") {
			const draft = data.draft;
			if (
				(draft.organizationContext ?? "SR") !==
					(event.organizationContext ?? "SR") ||
				(draft.committeeId ?? null) !== (event.committeeId ?? null)
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "EVENT_ORGANIZATION_FROZEN",
				});
			const rosterChanged = !sameRoster(
				event.rosterCriteria,
				draft.rosterCriteria,
			);
			before.rosterCriteria = event.rosterCriteria;
			before.session = sessionConfiguration(session);
			Object.assign(after, {
				title: draft.title,
				description: draft.description,
				startsAt: draft.startsAt,
				endsAt: draft.endsAt,
				rosterCriteria: rosterChanged
					? draft.rosterCriteria
					: event.rosterCriteria,
				session: draft.session,
			});
			// A changed criterion uses the same locked live directory as publication.
			// Retained invitees keep their original personal/organization snapshot.
			if (rosterChanged) {
				const directory = await getActiveSrDirectory(tx, true);
				const roster = committee
					? resolveCommitteeRoster(
							directory.candidates,
							draft.rosterCriteria,
							committee.members,
							new Set(),
						)
					: resolveRoster(directory.candidates, draft.rosterCriteria);
				const existing = await eventOperations.invitationIds(tx, event.id);
				const oldIds = new Set(existing.map((sr) => sr.userId));
				// Published committee membership is a frozen base, never the current committee roster.
				const newIds = new Set(
					committee
						? [...oldIds, ...roster.map((sr) => sr.userId)].filter(
								(id) => !draft.rosterCriteria.exclude.includes(id),
							)
						: roster.map((sr) => sr.userId),
				);
				if (
					committee &&
					[
						...draft.rosterCriteria.individuals,
						...draft.rosterCriteria.include,
					].some(
						(id) =>
							!oldIds.has(id) &&
							!draft.rosterCriteria.exclude.includes(id) &&
							!roster.some((sr) => sr.userId === id),
					)
				)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "EVENT_INVITEE_INELIGIBLE",
					});
				const added = roster.filter((sr) => !oldIds.has(sr.userId));
				const removed = existing
					.filter((sr) => !newIds.has(sr.userId))
					.map((sr) => sr.userId);
				before.participants = { count: existing.length };
				after.participants = {
					count: newIds.size,
					addedUserIds: added.map((sr) => sr.userId),
					removedUserIds: removed,
				};
				if (removed.length)
					await eventOperations.removeInvitationsBeforeAttendance(
						tx,
						event.id,
						removed,
					);
				if (added.length)
					await eventOperations.addInvitationSnapshots(tx, event.id, added);
			}
			await eventOperations.amendPublishedConfiguration(
				tx,
				event.id,
				draft,
				rosterChanged,
			);
			await attendanceOperations.configureSession(
				tx,
				session.id,
				draft.session,
			);
		} else {
			if (data.endsAt !== undefined) {
				const end = new Date(data.endsAt);
				if (mode === "METADATA" || end <= event.startsAt || end < new Date())
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "ADVANCED_EDIT_END_INVALID",
					});
				after.endsAt = end.toISOString();
			}
			after.title = data.title;
			after.description = data.description;
			await eventOperations.amendPublishedDetails(tx, event.id, data);
		}
		await eventOperations.appendEventAudit(tx, {
			eventId: event.id,
			actorUserId: identity.userId,
			reason: data.reason,
			action:
				data.mode === "FULL"
					? "PUBLISHED_CONFIGURATION_EDITED"
					: mode === "METADATA"
						? "CLOSED_METADATA_EDITED"
						: "PUBLISHED_DETAILS_EDITED",
			beforeState: before,
			afterState: after,
		});
	});
}
function requireState(actual: string, expected: string) {
	if (actual !== expected)
		throw new TRPCError({
			code: "CONFLICT",
			message: "Event/session state does not permit this action",
		});
}

function visibilityActions(
	event: EventFact,
	session: SessionFact,
): VisibilityAction[] {
	const closed = event.status === "CLOSED" && session.status === "CLOSED";
	const inactive =
		event.status === "PUBLISHED" && session.status === "INACTIVE";
	if (!closed && !inactive) return [];
	if (event.visibility === "ARCHIVED") return closed ? ["RESTORE"] : [];
	const actions: VisibilityAction[] = [];
	if (event.visibility === "VISIBLE") actions.push("HIDE");
	if (event.visibility === "HIDDEN") actions.push("UNHIDE");
	if (closed) actions.push("ARCHIVE");
	return actions;
}

async function draftDeletionBlocker(
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

export async function setEventVisibility(
	db: Database,
	identity: ActiveIdentity,
	input: EventVisibilityInput,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = eventVisibilitySchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid visibility request",
		});
	const data = parsed.data;
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(
			tx,
			data.eventId,
			identity,
			true,
		);
		if (!visibilityActions(event, session).includes(data.action))
			throw new TRPCError({
				code: "CONFLICT",
				message: "EVENT_VISIBILITY_CONFLICT",
			});
		const changes = {
			HIDE: { visibility: "HIDDEN", action: "EVENT_HIDDEN" },
			UNHIDE: { visibility: "VISIBLE", action: "EVENT_UNHIDDEN" },
			ARCHIVE: { visibility: "ARCHIVED", action: "EVENT_ARCHIVED" },
			RESTORE: { visibility: "VISIBLE", action: "EVENT_RESTORED" },
		} as const;
		const change = changes[data.action];
		const previousVisibility = event.visibility;
		await eventOperations.changeVisibility(tx, event.id, change.visibility);
		await eventOperations.appendEventAudit(tx, {
			eventId: event.id,
			actorUserId: identity.userId,
			action: change.action,
			reason: data.reason,
			beforeState: { visibility: previousVisibility },
			afterState: { visibility: change.visibility },
		});
		return { visibility: change.visibility };
	});
}

export async function deleteEventDraft(
	db: Database,
	identity: ActiveIdentity,
	input: DeleteDraftInput,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = deleteDraftSchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid deletion request",
		});
	const data = parsed.data;
	try {
		return await db.transaction(async (tx) => {
			const { event, session } = await lockedEvent(
				tx,
				data.eventId,
				identity,
				true,
			);
			if (await draftDeletionBlocker(tx, event, session))
				throw new TRPCError({
					code: "CONFLICT",
					message: "DRAFT_DELETE_NOT_ALLOWED",
				});
			// The inverse session constraint is deferred: once BOTH rows are gone,
			// it finds no parent at commit. No cascade or trigger bypass is needed.
			const [deletedSession] = await attendanceOperations.deleteUnusedSession(
				tx,
				session.id,
			);
			const [deletedEvent] = await eventOperations.deleteUnusedDraft(
				tx,
				event.id,
			);
			if (!deletedSession || !deletedEvent)
				throw new TRPCError({
					code: "CONFLICT",
					message: "DRAFT_DELETE_NOT_ALLOWED",
				});
			await eventOperations.recordDraftDeletion(
				tx,
				event,
				identity.userId,
				data.reason,
			);
			return { eventId: event.id };
		});
	} catch (error) {
		const cause =
			error instanceof Error && "cause" in error ? error.cause : error;
		if (
			cause &&
			typeof cause === "object" &&
			"code" in cause &&
			["23503", "23514", "23505"].includes(String(cause.code))
		)
			throw new TRPCError({
				code: "CONFLICT",
				message: "DRAFT_DELETE_NOT_ALLOWED",
			});
		throw error;
	}
}
export async function createEvent(
	db: Database,
	identity: ActiveIdentity,
	input: EventDraft,
) {
	operator(identity);
	const draft = eventDraftSchema.parse(input);
	return db.transaction(async (tx) => {
		if (draft.committeeId)
			await getCommitteeRoster(tx, draft.committeeId, true);
		operator(await getLiveOperationalIdentity(tx, identity.userId));
		const [event] = await eventOperations.createInternalDraft(
			tx,
			draft,
			identity.userId,
		);
		if (!event) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		await attendanceOperations.createInternalSession(
			tx,
			event.id,
			draft.session,
		);
		return { eventId: event.id };
	});
}
export async function editDraft(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	input: EventDraft,
) {
	operator(identity);
	const draft = eventDraftSchema.parse(input);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedRosterEvent(
			tx,
			eventId,
			identity,
			draft.committeeId,
		);
		requireState(event.status, "DRAFT");
		requireState(session.status, "INACTIVE");
		await eventOperations.replaceDraftDetails(tx, eventId, draft);
		await attendanceOperations.configureInternalSession(
			tx,
			eventId,
			draft.session,
		);
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
		await eventOperations.editPublishedMetadata(tx, eventId, metadata);
	});
}
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
async function readEventDetail(
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
export async function previewRoster(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, committee } = await lockedRosterEvent(tx, eventId, identity);
		requireState(event.status, "DRAFT");
		const directory = await getActiveSrDirectory(tx);
		return {
			participants: committee
				? resolveCommitteeRoster(
						directory.candidates,
						event.rosterCriteria,
						committee.members,
					)
				: resolveRoster(directory.candidates, event.rosterCriteria).map(
						(sr) => ({
							...sr,
							committeeDivision: null,
							committeePosition: null,
						}),
					),
			invalidAssignmentCount: directory.invalidAssignmentCount,
		};
	});
}
export async function publishEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session, committee } = await lockedRosterEvent(
			tx,
			eventId,
			identity,
		);
		requireState(event.status, "DRAFT");
		requireState(session.status, "INACTIVE");
		const directory = await getActiveSrDirectory(tx, true);
		const roster = committee
			? resolveCommitteeRoster(
					directory.candidates,
					event.rosterCriteria,
					committee.members,
				)
			: resolveRoster(directory.candidates, event.rosterCriteria);
		if (roster.length)
			await eventOperations.addInvitationSnapshots(tx, eventId, roster);
		await eventOperations.publishInternalDraft(
			tx,
			eventId,
			committee?.name ?? null,
		);
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
		await attendanceOperations.invalidateSessionChallenges(tx, session.id, now);
		await attendanceOperations.closeInternalSession(tx, session.id, now);
		await eventOperations.closePublishedEvent(tx, eventId, now);
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
	const [challenge] = await attendanceOperations.currentChallenge(
		db,
		row.session.id,
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

async function readEventContext(
	db: Database | DatabaseTransaction,
	eventId: string,
) {
	const [event] = await eventOperations.readEvent(db, eventId);
	if (!event) return [];
	const [session] = await attendanceOperations.readInternalSession(db, eventId);
	return session ? [{ event, session }] : [];
}
async function deletionReferences(
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

// Composed Event/Attendance reads retain a single MVCC snapshot.
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
