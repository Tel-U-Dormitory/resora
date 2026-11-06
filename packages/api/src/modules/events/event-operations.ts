import type { Database, DatabaseTransaction } from "@resora/db";
import {
	eventAuditLogs,
	eventDeletionAudits,
	eventParticipants,
	events,
} from "@resora/db/schema/attendance";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { EventDraft, EventListInput } from "../../contracts/attendance";
import type { SrCandidate } from "../identity/identity.public";

type Db = Database | DatabaseTransaction;

import type {
	EventAuditEvidence,
	EventFact,
	InvitationFact,
} from "./event.types";

export type {
	EventEditAuditState,
	EventFact,
	InvitationFact,
	RosterCriteria,
} from "./event.types";

import { TRPCError } from "@trpc/server";

type SnapshotCandidate = SrCandidate & {
	committeeDivision?: string | null;
	committeePosition?: InvitationFact["committeePosition"];
};
export async function eventOrganizationHint(db: Db, eventId: string) {
	return await db
		.select({ committeeId: events.committeeId })
		.from(events)
		.where(eq(events.id, eventId));
}

export async function lockEventForManagement(
	db: Db,
	eventId: string,
): Promise<EventFact[]> {
	return await db
		.select()
		.from(events)
		.where(eq(events.id, eventId))
		.for("update");
}

export async function invitationIds(db: Db, eventId: string) {
	return await db
		.select({ userId: eventParticipants.userId })
		.from(eventParticipants)
		.where(eq(eventParticipants.eventId, eventId));
}

export async function removeInvitationsBeforeAttendance(
	db: Db,
	eventId: string,
	removed: string[],
) {
	await db
		.delete(eventParticipants)
		.where(
			and(
				eq(eventParticipants.eventId, eventId),
				inArray(eventParticipants.userId, removed),
			),
		);
}

function participantSnapshot(
	eventId: string,
	sr: SrCandidate & {
		committeeDivision?: string | null;
		committeePosition?: InvitationFact["committeePosition"];
	},
) {
	return {
		eventId,
		userId: sr.userId,
		nim: sr.nim,
		name: sr.name,
		departmentCode: sr.departmentCode,
		positionCode: sr.positionCode,
		buildingCode: sr.buildingCode,
		buildingName: sr.buildingName,
		committeeDivision: sr.committeeDivision ?? null,
		committeePosition: sr.committeePosition ?? null,
	};
}

export async function addInvitationSnapshots(
	db: Db,
	eventId: string,
	added: SnapshotCandidate[],
) {
	await db
		.insert(eventParticipants)
		.values(added.map((sr) => participantSnapshot(eventId, sr)));
}

export async function amendPublishedConfiguration(
	db: Db,
	eventId: string,
	draft: EventDraft,
	rosterChanged: boolean,
) {
	await db
		.update(events)
		.set({
			title: draft.title,
			description: draft.description,
			startsAt: new Date(draft.startsAt),
			endsAt: new Date(draft.endsAt),
			...(rosterChanged ? { rosterCriteria: draft.rosterCriteria } : {}),
		})
		.where(eq(events.id, eventId));
}

export async function amendPublishedDetails(
	db: Db,
	eventId: string,
	data: { title: string; description: string; endsAt?: string },
) {
	await db
		.update(events)
		.set({
			title: data.title,
			description: data.description,
			...(data.endsAt !== undefined ? { endsAt: new Date(data.endsAt) } : {}),
		})
		.where(eq(events.id, eventId));
}

export async function appendEventAudit(db: Db, evidence: EventAuditEvidence) {
	await db.insert(eventAuditLogs).values(evidence);
}

export async function eventHasDeletionReferences(db: Db, eventId: string) {
	return await db
		.select({
			hasReferences: sql<boolean>`EXISTS (SELECT 1 FROM ${eventParticipants} WHERE ${eventParticipants.eventId} = ${eventId}) OR EXISTS (SELECT 1 FROM ${eventAuditLogs} WHERE ${eventAuditLogs.eventId} = ${eventId})`,
		})
		.from(events)
		.where(eq(events.id, eventId));
}

export async function changeVisibility(
	db: Db,
	eventId: string,
	visibility: EventFact["visibility"],
) {
	await db
		.update(events)
		.set({ visibility: visibility })
		.where(eq(events.id, eventId));
}

export async function deleteUnusedDraft(
	db: DatabaseTransaction,
	eventId: string,
) {
	const [event] = await lockEventForManagement(db, eventId);
	const [references] = await eventHasDeletionReferences(db, eventId);
	if (
		!event ||
		event.status !== "DRAFT" ||
		event.visibility !== "VISIBLE" ||
		references?.hasReferences !== false
	)
		throw new TRPCError({
			code: "CONFLICT",
			message: "DRAFT_DELETE_NOT_ALLOWED",
		});
	return await db
		.delete(events)
		.where(eq(events.id, eventId))
		.returning({ id: events.id });
}

export async function recordDraftDeletion(
	db: Db,
	event: EventFact,
	actorUserId: string,
	reason: string,
) {
	await db.insert(eventDeletionAudits).values({
		eventId: event.id,
		actorUserId: actorUserId,
		action: "EVENT_DRAFT_DELETED",
		reason: reason,
		eventSnapshot: {
			title: event.title,
			status: "DRAFT",
			startsAt: event.startsAt.toISOString(),
			endsAt: event.endsAt.toISOString(),
		},
	});
}

export async function createInternalDraft(
	db: Db,
	draft: EventDraft,
	actorUserId: string,
) {
	return await db
		.insert(events)
		.values({
			title: draft.title,
			description: draft.description,
			createdByUserId: actorUserId,
			startsAt: new Date(draft.startsAt),
			endsAt: new Date(draft.endsAt),
			rosterCriteria: draft.rosterCriteria,
			organizationContext: draft.organizationContext ?? "SR",
			committeeId: draft.committeeId ?? null,
		})
		.returning();
}

export async function replaceDraftDetails(
	db: Db,
	eventId: string,
	draft: EventDraft,
) {
	await db
		.update(events)
		.set({
			title: draft.title,
			description: draft.description,
			startsAt: new Date(draft.startsAt),
			endsAt: new Date(draft.endsAt),
			rosterCriteria: draft.rosterCriteria,
			organizationContext: draft.organizationContext ?? "SR",
			committeeId: draft.committeeId ?? null,
			snapshotCommitteeName: null,
		})
		.where(eq(events.id, eventId));
}

export async function editPublishedMetadata(
	db: Db,
	eventId: string,
	metadata: { title: string; description: string },
) {
	await db.update(events).set(metadata).where(eq(events.id, eventId));
}

const eventListFields = {
	id: events.id,
	title: events.title,
	description: events.description,
	status: events.status,
	startsAt: events.startsAt,
	endsAt: events.endsAt,
	visibility: events.visibility,
};

export async function listManagedEvents(db: Db, filter: EventListInput) {
	return await db
		.select(eventListFields)
		.from(events)
		.where(
			filter.visibility === "NON_ARCHIVED"
				? ne(events.visibility, "ARCHIVED")
				: eq(events.visibility, filter.visibility),
		)
		.orderBy(desc(events.startsAt));
}

export async function listInvitedEvents(db: Db, userId: string) {
	return await db
		.select(eventListFields)
		.from(events)
		.innerJoin(eventParticipants, eq(eventParticipants.eventId, events.id))
		.where(
			and(
				eq(events.status, "PUBLISHED"),
				eq(events.visibility, "VISIBLE"),
				eq(eventParticipants.userId, userId),
			),
		)
		.orderBy(desc(events.startsAt));
}

export async function readEvent(db: Db, eventId: string): Promise<EventFact[]> {
	return await db.select().from(events).where(eq(events.id, eventId));
}

export async function invitationForUser(
	db: Db,
	eventId: string,
	userId: string,
) {
	return await db
		.select({ userId: eventParticipants.userId })
		.from(eventParticipants)
		.where(
			and(
				eq(eventParticipants.eventId, eventId),
				eq(eventParticipants.userId, userId),
			),
		);
}

export async function invitationSnapshots(
	db: Db,
	eventId: string,
): Promise<InvitationFact[]> {
	return await db
		.select()
		.from(eventParticipants)
		.where(eq(eventParticipants.eventId, eventId));
}

export async function publishInternalDraft(
	db: Db,
	eventId: string,
	committeeName: string | null,
) {
	await db
		.update(events)
		.set({
			status: "PUBLISHED",
			publishedAt: new Date(),
			snapshotCommitteeName: committeeName,
		})
		.where(eq(events.id, eventId));
}

export async function closePublishedEvent(db: Db, eventId: string, now: Date) {
	await db
		.update(events)
		.set({ status: "CLOSED", closedAt: now })
		.where(eq(events.id, eventId));
}

// Attendance calls these after checking its own operator scope. Lock order is
// Event -> Session -> live Identity; these reads do not grant mutation authority.
export async function lockEventForCheckIn(
	db: Db,
	eventId: string,
): Promise<EventFact[]> {
	return await db
		.select()
		.from(events)
		.where(eq(events.id, eventId))
		.for("share");
}
export async function reportInvitationSnapshots(db: Db, eventId: string) {
	return await db
		.select({
			userId: eventParticipants.userId,
			nim: eventParticipants.nim,
			name: eventParticipants.name,
			departmentCode: eventParticipants.departmentCode,
			positionCode: eventParticipants.positionCode,
			buildingCode: eventParticipants.buildingCode,
			buildingName: eventParticipants.buildingName,
			committeeDivision: eventParticipants.committeeDivision,
			committeePosition: eventParticipants.committeePosition,
		})
		.from(eventParticipants)
		.where(eq(eventParticipants.eventId, eventId))
		.orderBy(asc(eventParticipants.nim), asc(eventParticipants.userId));
}
export async function ownInvitedEventHistory(
	db: Db,
	userId: string,
	limit: number,
	offset: number,
) {
	return await db
		.select({
			event: {
				id: events.id,
				title: events.title,
				status: events.status,
				startsAt: events.startsAt,
				endsAt: events.endsAt,
			},
		})
		.from(eventParticipants)
		.innerJoin(events, eq(events.id, eventParticipants.eventId))
		.where(
			and(eq(eventParticipants.userId, userId), ne(events.status, "DRAFT")),
		)
		.orderBy(desc(events.startsAt), desc(events.id))
		.limit(limit)
		.offset(offset);
}
