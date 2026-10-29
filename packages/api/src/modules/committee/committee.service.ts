import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	committeeDivisions,
	committeeMembers,
	committeePositionCodes,
	committees,
} from "@resora/db/schema/committee";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, ilike, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	canManageCommittee,
	canManageInternalEvent,
	getActiveSrCandidate,
	getActiveSrDirectory,
	getLiveOperationalIdentity,
	getSrMemberIdentities,
} from "../identity/identity.public";
import type {
	addMembersSchema,
	committeeFieldsSchema,
	listCommitteesSchema,
	memberSchema,
} from "./committee.schema";

function authorize(identity: ActiveIdentity | null, write = false) {
	if (
		!canManageCommittee(identity) &&
		(write || !canManageInternalEvent(identity))
	)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "COMMITTEE_ACCESS_DENIED",
		});
}

async function lockedCommittee(
	tx: DatabaseTransaction,
	committeeId: string,
	mode: "share" | "update",
) {
	const [row] = await tx
		.select({
			id: committees.id,
			name: committees.name,
			description: committees.description,
			createdAt: committees.createdAt,
			updatedAt: committees.updatedAt,
		})
		.from(committees)
		.where(eq(committees.id, committeeId))
		.for(mode);
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "COMMITTEE_NOT_FOUND" });
	return row;
}

// Every mutation locks the committee first, then validates the live operator.
// This also serializes empty-delete checks against division/member writes.
async function write<T>(
	db: Database,
	identity: ActiveIdentity,
	committeeId: string | null,
	action: (tx: DatabaseTransaction) => Promise<T>,
) {
	authorize(identity, true);
	try {
		return await db.transaction(async (tx) => {
			if (committeeId) await lockedCommittee(tx, committeeId, "update");
			authorize(await getLiveOperationalIdentity(tx, identity.userId), true);
			const result = await action(tx);
			if (committeeId)
				await tx
					.update(committees)
					.set({ updatedAt: new Date() })
					.where(eq(committees.id, committeeId));
			return result;
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		const failure = error as { code?: string; cause?: { code?: string } };
		const code = failure.code ?? failure.cause?.code;
		if (code === "23505")
			throw new TRPCError({ code: "CONFLICT", message: "COMMITTEE_DUPLICATE" });
		if (code === "23503")
			throw new TRPCError({
				code: "CONFLICT",
				message: "COMMITTEE_REFERENCE_IN_USE",
			});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "COMMITTEE_REQUEST_FAILED",
		});
	}
}

export async function listCommittees(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof listCommitteesSchema>,
) {
	authorize(identity);
	const filter = input.search
		? ilike(committees.name, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`)
		: undefined;
	const rows = await db
		.select({
			id: committees.id,
			name: committees.name,
			description: committees.description,
			createdAt: committees.createdAt,
			updatedAt: committees.updatedAt,
			// Keep the outer ID qualified: divisions have their own id column.
			divisionCount: sql<number>`(select count(*)::int from ${committeeDivisions} where ${committeeDivisions.committeeId} = ${sql.identifier("committees")}.${sql.identifier("id")})`,
			memberCount: sql<number>`(select count(*)::int from ${committeeMembers} where ${committeeMembers.committeeId} = ${sql.identifier("committees")}.${sql.identifier("id")})`,
		})
		.from(committees)
		.where(filter)
		.orderBy(asc(committees.name), asc(committees.id))
		.limit(input.limit)
		.offset(input.offset);
	const [total] = await db
		.select({ count: count() })
		.from(committees)
		.where(filter);
	return { committees: rows, total: total?.count ?? 0 };
}

export async function committeeDetail(
	db: Database,
	identity: ActiveIdentity,
	committeeId: string,
) {
	authorize(identity);
	return db.transaction(async (tx) => {
		const committee = await lockedCommittee(tx, committeeId, "share");
		const divisions = await tx
			.select({ id: committeeDivisions.id, name: committeeDivisions.name })
			.from(committeeDivisions)
			.where(eq(committeeDivisions.committeeId, committeeId))
			.orderBy(asc(committeeDivisions.name), asc(committeeDivisions.id));
		const memberships = await tx
			.select({
				userId: committeeMembers.userId,
				divisionId: committeeMembers.divisionId,
				positionCode: committeeMembers.positionCode,
			})
			.from(committeeMembers)
			.where(eq(committeeMembers.committeeId, committeeId));
		const identities = await getSrMemberIdentities(
			tx,
			memberships.map((row) => row.userId),
		);
		const { candidates } = await getActiveSrDirectory(tx);
		const eligibleIds = new Set(candidates.map((row) => row.userId));
		const byId = new Map(identities.map((row) => [row.userId, row]));
		const members = memberships
			.map((row) => ({
				...row,
				name: byId.get(row.userId)?.name ?? "SR tidak tersedia",
				nim: byId.get(row.userId)?.nim ?? "",
				eligible: eligibleIds.has(row.userId),
			}))
			.sort(
				(a, b) =>
					a.name.localeCompare(b.name, "id") ||
					a.userId.localeCompare(b.userId),
			);
		return {
			...committee,
			divisions,
			members,
			positions: committeePositionCodes,
		};
	});
}

export async function committeeCandidates(
	db: Database,
	identity: ActiveIdentity,
	committeeId: string,
	search: string,
) {
	authorize(identity, true);
	const [committee] = await db
		.select({ id: committees.id })
		.from(committees)
		.where(eq(committees.id, committeeId))
		.limit(1);
	if (!committee)
		throw new TRPCError({ code: "NOT_FOUND", message: "COMMITTEE_NOT_FOUND" });
	const { candidates } = await getActiveSrDirectory(db);
	const members = await db
		.select({ userId: committeeMembers.userId })
		.from(committeeMembers)
		.where(eq(committeeMembers.committeeId, committeeId));
	const existing = new Set(members.map((row) => row.userId));
	const term = search.toLocaleLowerCase("id");
	return candidates
		.filter(
			(row) =>
				!existing.has(row.userId) &&
				`${row.name} ${row.nim}`.toLocaleLowerCase("id").includes(term),
		)
		.sort(
			(a, b) =>
				a.name.localeCompare(b.name, "id") || a.userId.localeCompare(b.userId),
		)
		.slice(0, 20)
		.map(({ userId, name, nim }) => ({ userId, name, nim }));
}

export function createCommittee(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof committeeFieldsSchema>,
) {
	return write(db, identity, null, async (tx) => {
		const [row] = await tx
			.insert(committees)
			.values({ ...input, createdByUserId: identity.userId })
			.returning({ id: committees.id });
		return row;
	});
}
export function updateCommittee(
	db: Database,
	identity: ActiveIdentity,
	committeeId: string,
	input: z.infer<typeof committeeFieldsSchema>,
) {
	return write(db, identity, committeeId, async (tx) => {
		await tx
			.update(committees)
			.set(input)
			.where(eq(committees.id, committeeId));
		return { success: true };
	});
}
export function deleteCommittee(
	db: Database,
	identity: ActiveIdentity,
	committeeId: string,
) {
	return write(db, identity, committeeId, async (tx) => {
		const [division] = await tx
			.select({ id: committeeDivisions.id })
			.from(committeeDivisions)
			.where(eq(committeeDivisions.committeeId, committeeId))
			.limit(1);
		const [member] = await tx
			.select({ userId: committeeMembers.userId })
			.from(committeeMembers)
			.where(eq(committeeMembers.committeeId, committeeId))
			.limit(1);
		if (division || member)
			throw new TRPCError({ code: "CONFLICT", message: "COMMITTEE_NOT_EMPTY" });
		await tx.delete(committees).where(eq(committees.id, committeeId));
		return { success: true };
	});
}

export function saveDivision(
	db: Database,
	identity: ActiveIdentity,
	input: { committeeId: string; name: string; divisionId?: string },
) {
	return write(db, identity, input.committeeId, async (tx) => {
		if (!input.divisionId) {
			const [row] = await tx
				.insert(committeeDivisions)
				.values({ committeeId: input.committeeId, name: input.name })
				.returning({ id: committeeDivisions.id });
			return row;
		}
		const [row] = await tx
			.update(committeeDivisions)
			.set({ name: input.name })
			.where(
				and(
					eq(committeeDivisions.committeeId, input.committeeId),
					eq(committeeDivisions.id, input.divisionId),
				),
			)
			.returning({ id: committeeDivisions.id });
		if (!row)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "COMMITTEE_DIVISION_NOT_FOUND",
			});
		return row;
	});
}
export function deleteDivision(
	db: Database,
	identity: ActiveIdentity,
	input: { committeeId: string; divisionId: string },
) {
	return write(db, identity, input.committeeId, async (tx) => {
		const [row] = await tx
			.delete(committeeDivisions)
			.where(
				and(
					eq(committeeDivisions.committeeId, input.committeeId),
					eq(committeeDivisions.id, input.divisionId),
				),
			)
			.returning({ id: committeeDivisions.id });
		if (!row)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "COMMITTEE_DIVISION_NOT_FOUND",
			});
		return { success: true };
	});
}
export function saveMember(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof memberSchema>,
	update = false,
) {
	return write(db, identity, input.committeeId, async (tx) => {
		if (!(await getActiveSrCandidate(tx, input.userId)))
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "COMMITTEE_MEMBER_INELIGIBLE",
			});
		const [division] = await tx
			.select({ id: committeeDivisions.id })
			.from(committeeDivisions)
			.where(
				and(
					eq(committeeDivisions.committeeId, input.committeeId),
					eq(committeeDivisions.id, input.divisionId),
				),
			);
		if (!division)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "COMMITTEE_DIVISION_NOT_FOUND",
			});
		if (update) {
			const [row] = await tx
				.update(committeeMembers)
				.set({ divisionId: input.divisionId, positionCode: input.positionCode })
				.where(
					and(
						eq(committeeMembers.committeeId, input.committeeId),
						eq(committeeMembers.userId, input.userId),
					),
				)
				.returning({ userId: committeeMembers.userId });
			if (!row)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "COMMITTEE_MEMBER_NOT_FOUND",
				});
		} else await tx.insert(committeeMembers).values(input);
		return { success: true };
	});
}
export function addMembers(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof addMembersSchema>,
) {
	return write(db, identity, input.committeeId, async (tx) => {
		const [division] = await tx
			.select({ id: committeeDivisions.id })
			.from(committeeDivisions)
			.where(
				and(
					eq(committeeDivisions.committeeId, input.committeeId),
					eq(committeeDivisions.id, input.divisionId),
				),
			);
		if (!division)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "COMMITTEE_DIVISION_NOT_FOUND",
			});
		// Keep candidate SHARE locks and their order consistent across batches.
		for (const userId of [...input.userIds].sort())
			if (!(await getActiveSrCandidate(tx, userId)))
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "COMMITTEE_MEMBER_INELIGIBLE",
				});
		const [existing] = await tx
			.select({ userId: committeeMembers.userId })
			.from(committeeMembers)
			.where(
				and(
					eq(committeeMembers.committeeId, input.committeeId),
					inArray(committeeMembers.userId, input.userIds),
				),
			)
			.limit(1);
		if (existing)
			throw new TRPCError({ code: "CONFLICT", message: "COMMITTEE_DUPLICATE" });
		await tx.insert(committeeMembers).values(
			input.userIds.map((userId) => ({
				committeeId: input.committeeId,
				divisionId: input.divisionId,
				positionCode: input.positionCode,
				userId,
			})),
		);
		return { success: true, addedCount: input.userIds.length };
	});
}

export function removeMember(
	db: Database,
	identity: ActiveIdentity,
	input: { committeeId: string; userId: string },
) {
	return write(db, identity, input.committeeId, async (tx) => {
		const [row] = await tx
			.delete(committeeMembers)
			.where(
				and(
					eq(committeeMembers.committeeId, input.committeeId),
					eq(committeeMembers.userId, input.userId),
				),
			)
			.returning({ userId: committeeMembers.userId });
		if (!row)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "COMMITTEE_MEMBER_NOT_FOUND",
			});
		return { success: true };
	});
}
