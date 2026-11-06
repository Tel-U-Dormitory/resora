import type { Database, DatabaseTransaction } from "@resora/db";
import {
	eventAuditLogs,
	eventDeletionAudits,
	events,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { EventDraft } from "../../contracts/attendance";
import type { EventAuditEvidence, EventFact } from "./event.types";
import {
	eventFactFields,
	eventHasDeletionReferences,
	lockEventForManagement,
} from "./event-queries";

type Db = Database | DatabaseTransaction;

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
		event?.status !== "DRAFT" ||
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
		.returning(eventFactFields);
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
