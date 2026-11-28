import type { Database, DatabaseTransaction } from "@resora/db";
import {
	committeeDivisions,
	committeeMembers,
	committees,
} from "@resora/db/schema/committee";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";

// Backend-only attendance contract. Callers enforce event authorization.
// Committee SHARE precedes event/session/identity locks; CRUD takes committee UPDATE first.
export async function getCommitteeRoster(
	db: Database | DatabaseTransaction,
	committeeId: string,
	lock = false,
) {
	const query = db
		.select({ id: committees.id, name: committees.name })
		.from(committees)
		.where(eq(committees.id, committeeId));
	const [committee] = await (lock ? query.for("share") : query);
	if (!committee)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "EVENT_COMMITTEE_UNAVAILABLE",
		});
	const members = await db
		.select({
			userId: committeeMembers.userId,
			committeeDivision: committeeDivisions.name,
			committeePosition: committeeMembers.positionCode,
		})
		.from(committeeMembers)
		.innerJoin(
			committeeDivisions,
			and(
				eq(committeeDivisions.id, committeeMembers.divisionId),
				eq(committeeDivisions.committeeId, committeeMembers.committeeId),
			),
		)
		.where(eq(committeeMembers.committeeId, committeeId));
	return { ...committee, members };
}

export async function listCommitteesForUsers(
	db: Database | DatabaseTransaction,
	userIds: readonly string[],
) {
	if (!userIds.length) return [];
	return db
		.select({
			userId: committeeMembers.userId,
			committeeId: committees.id,
			committeeName: committees.name,
			divisionName: committeeDivisions.name,
			positionCode: committeeMembers.positionCode,
		})
		.from(committeeMembers)
		.innerJoin(committees, eq(committees.id, committeeMembers.committeeId))
		.innerJoin(
			committeeDivisions,
			and(
				eq(committeeDivisions.id, committeeMembers.divisionId),
				eq(committeeDivisions.committeeId, committeeMembers.committeeId),
			),
		)
		.where(inArray(committeeMembers.userId, [...new Set(userIds)]))
		.orderBy(asc(committees.name), asc(committeeDivisions.name));
}

export { committeeRouter } from "./committee.router";
