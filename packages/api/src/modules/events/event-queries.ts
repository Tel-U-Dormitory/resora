import type { Database, DatabaseTransaction } from "@resora/db";
import {
	eventAuditLogs,
	eventParticipants,
	events,
} from "@resora/db/schema/attendance";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { EventListInput } from "../../contracts/attendance";
import type { EventFact } from "./event.types";

type Db = Database | DatabaseTransaction;

export const eventFactFields = {
	id: events.id,
	title: events.title,
	description: events.description,
	createdByUserId: events.createdByUserId,
	status: events.status,
	visibility: events.visibility,
	startsAt: events.startsAt,
	endsAt: events.endsAt,
	rosterCriteria: events.rosterCriteria,
	organizationContext: events.organizationContext,
	committeeId: events.committeeId,
	snapshotCommitteeName: events.snapshotCommitteeName,
	publishedAt: events.publishedAt,
	closedAt: events.closedAt,
	createdAt: events.createdAt,
	updatedAt: events.updatedAt,
};
const eventListFields = {
	id: events.id,
	title: events.title,
	description: events.description,
	status: events.status,
	startsAt: events.startsAt,
	endsAt: events.endsAt,
	visibility: events.visibility,
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
		.select(eventFactFields)
		.from(events)
		.where(eq(events.id, eventId))
		.for("update");
}

export async function eventHasDeletionReferences(db: Db, eventId: string) {
	return await db
		.select({
			hasReferences: sql<boolean>`EXISTS (SELECT 1 FROM ${eventParticipants} WHERE ${eventParticipants.eventId} = ${eventId}) OR EXISTS (SELECT 1 FROM ${eventAuditLogs} WHERE ${eventAuditLogs.eventId} = ${eventId})`,
		})
		.from(events)
		.where(eq(events.id, eventId));
}

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
	return await db
		.select(eventFactFields)
		.from(events)
		.where(eq(events.id, eventId));
}

export async function lockEventForCheckIn(
	db: Db,
	eventId: string,
): Promise<EventFact[]> {
	return await db
		.select(eventFactFields)
		.from(events)
		.where(eq(events.id, eventId))
		.for("share");
}
