import type { Database, DatabaseTransaction } from "@resora/db";
import { eventParticipants, events } from "@resora/db/schema/attendance";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { SrCandidate } from "../identity/identity.public";
import type { InvitationFact } from "./event.types";

type Db = Database | DatabaseTransaction;
const invitationFields = {
	eventId: eventParticipants.eventId,
	userId: eventParticipants.userId,
	nim: eventParticipants.nim,
	name: eventParticipants.name,
	departmentCode: eventParticipants.departmentCode,
	positionCode: eventParticipants.positionCode,
	buildingCode: eventParticipants.buildingCode,
	buildingName: eventParticipants.buildingName,
	committeeDivision: eventParticipants.committeeDivision,
	committeePosition: eventParticipants.committeePosition,
	invitedAt: eventParticipants.invitedAt,
};

type SnapshotCandidate = SrCandidate & {
	committeeDivision?: string | null;
	committeePosition?: InvitationFact["committeePosition"];
};
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
		.select(invitationFields)
		.from(eventParticipants)
		.where(eq(eventParticipants.eventId, eventId));
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
