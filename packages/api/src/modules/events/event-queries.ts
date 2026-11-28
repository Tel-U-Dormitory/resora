import type { Database, DatabaseTransaction } from "@resora/db";
import {
	eventAuditLogs,
	eventParticipants,
	events,
} from "@resora/db/schema/attendance";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	ne,
	or,
	sql,
} from "drizzle-orm";
import type { EventListInput } from "../../contracts/attendance";
import type { EventFact } from "./event.types";

type Db = Database | DatabaseTransaction;

export async function closedEventsForScoring(
	db: Db,
	startsOn: string,
	endsOn: string,
) {
	return db
		.select({
			eventId: events.id,
			title: events.title,
			startsAt: events.startsAt,
			closedAt: events.closedAt,
			scoringMode: events.attendanceScoringMode,
			visibility: events.visibility,
			organizationContext: events.organizationContext,
			committeeName: events.snapshotCommitteeName,
			rosterCriteria: events.rosterCriteria,
		})
		.from(events)
		.where(
			and(
				eq(events.status, "CLOSED"),
				or(
					eq(events.attendanceScoringMode, "INCLUDED"),
					isNull(events.attendanceScoringMode),
				),
				gte(
					events.startsAt,
					sql`(${startsOn}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`,
				),
				lt(
					events.startsAt,
					sql`((${endsOn}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')`,
				),
			),
		)
		.orderBy(asc(events.startsAt), asc(events.id));
}

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
	attendanceScoringMode: events.attendanceScoringMode,
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
		.select({
			...eventListFields,
			rosterCriteria: events.rosterCriteria,
			organizationContext: events.organizationContext,
		})
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

export async function listEvaluatableEvents(
	db: Db,
	startsOn: string,
	endsOn: string,
) {
	return db
		.select({
			eventId: events.id,
			title: events.title,
			status: events.status,
			visibility: events.visibility,
			startsAt: events.startsAt,
			endsAt: events.endsAt,
			organizationContext: events.organizationContext,
			committeeName: events.snapshotCommitteeName,
		})
		.from(events)
		.where(
			and(
				or(eq(events.status, "PUBLISHED"), eq(events.status, "CLOSED")),
				ne(events.visibility, "ARCHIVED"),
				gte(
					events.startsAt,
					sql`(${startsOn}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`,
				),
				lt(
					events.startsAt,
					sql`((${endsOn}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')`,
				),
			),
		)
		.orderBy(asc(events.startsAt), asc(events.id));
}

export async function listInvitedEventsForUsers(
	db: Db,
	userIds: readonly string[],
) {
	if (!userIds.length) return [];
	return db
		.select({
			userId: eventParticipants.userId,
			eventId: events.id,
			title: events.title,
			status: events.status,
			visibility: events.visibility,
			startsAt: events.startsAt,
			endsAt: events.endsAt,
			closedAt: events.closedAt,
			organizationContext: events.organizationContext,
			committeeName: events.snapshotCommitteeName,
		})
		.from(eventParticipants)
		.innerJoin(events, eq(events.id, eventParticipants.eventId))
		.where(
			and(
				inArray(eventParticipants.userId, [...new Set(userIds)]),
				or(eq(events.status, "PUBLISHED"), eq(events.status, "CLOSED")),
				ne(events.visibility, "ARCHIVED"),
			),
		)
		.orderBy(desc(events.startsAt), asc(events.id));
}
