import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { user } from "@resora/db/schema/auth";
import { broadcasts } from "@resora/db/schema/broadcast";
import { TRPCError } from "@trpc/server";
import {
	and,
	count,
	desc,
	eq,
	gt,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";
import type { z } from "zod";
import {
	canManageBroadcast,
	canReadBroadcast,
	getLiveOperationalIdentity,
	hasSuperadminPrivilege,
} from "../identity/identity.public";
import type {
	broadcastFieldsSchema,
	listBroadcastsSchema,
} from "./broadcast.schema";

const sevenDays = 7 * 24 * 60 * 60 * 1000;
const fields = {
	id: broadcasts.id,
	title: broadcasts.title,
	content: broadcasts.content,
	linkUrl: broadcasts.linkUrl,
	creatorName: user.name,
	publishedAt: broadcasts.publishedAt,
	expiresAt: broadcasts.expiresAt,
	archivedAt: broadcasts.archivedAt,
};
type BroadcastRow = typeof broadcasts.$inferSelect;

function fail(
	message: string,
	code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
): never {
	throw new TRPCError({ code, message });
}
function authorize(identity: ActiveIdentity | null, write = false) {
	if (!(write ? canManageBroadcast(identity) : canReadBroadcast(identity)))
		fail("BROADCAST_ACCESS_DENIED", "FORBIDDEN");
}
async function databaseTime(tx: DatabaseTransaction) {
	// Evaluate after waiting for locks; transaction-start time can already be stale.
	const result = await tx.execute<{ now: Date }>(
		sql`SELECT clock_timestamp() AS now`,
	);
	const now = new Date(result.rows[0]?.now ?? Number.NaN);
	if (!Number.isFinite(now.getTime())) throw Error("Database time unavailable");
	return now;
}
export function isBroadcastActive(
	row: Pick<BroadcastRow, "publishedAt" | "expiresAt" | "archivedAt">,
	now: Date,
) {
	return (
		row.archivedAt === null && row.publishedAt <= now && row.expiresAt > now
	);
}
function canOwn(identity: ActiveIdentity, creatorId: string) {
	return (
		canManageBroadcast(identity) &&
		(identity.userId === creatorId || hasSuperadminPrivilege(identity))
	);
}
function dto(
	row: {
		id: string;
		title: string;
		content: string;
		linkUrl: string | null;
		creatorName: string;
		publishedAt: Date;
		expiresAt: Date;
		archivedAt: Date | null;
		createdByUserId: string;
	},
	identity: ActiveIdentity,
	now: Date,
) {
	const permitted =
		isBroadcastActive(row, now) && canOwn(identity, row.createdByUserId);
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		linkUrl: row.linkUrl,
		creatorName: row.creatorName,
		publishedAt: row.publishedAt,
		expiresAt: row.expiresAt,
		archivedAt: row.archivedAt,
		status: isBroadcastActive(row, now)
			? ("ACTIVE" as const)
			: ("HISTORY" as const),
		canEdit: permitted,
		canArchive: permitted,
	};
}

export async function listBroadcasts(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof listBroadcastsSchema>,
) {
	authorize(identity);
	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		authorize(live);
		if (!live) fail("BROADCAST_ACCESS_DENIED", "FORBIDDEN");
		const now = await databaseTime(tx);
		const filter =
			input.view === "ACTIVE"
				? and(
						isNull(broadcasts.archivedAt),
						lte(broadcasts.publishedAt, now),
						gt(broadcasts.expiresAt, now),
					)
				: or(isNotNull(broadcasts.archivedAt), lte(broadcasts.expiresAt, now));
		const rows = await tx
			.select({ ...fields, createdByUserId: broadcasts.createdByUserId })
			.from(broadcasts)
			.innerJoin(user, eq(user.id, broadcasts.createdByUserId))
			.where(filter)
			.orderBy(desc(broadcasts.publishedAt), desc(broadcasts.id))
			.limit(input.limit)
			.offset(input.offset);
		const [total] = await tx
			.select({ count: count() })
			.from(broadcasts)
			.where(filter);
		return {
			items: rows.map((row) => dto(row, live, now)),
			total: total?.count ?? 0,
		};
	});
}
export async function latestBroadcasts(db: Database, identity: ActiveIdentity) {
	return (
		await listBroadcasts(db, identity, { view: "ACTIVE", limit: 3, offset: 0 })
	).items;
}
export async function broadcastDetail(
	db: Database,
	identity: ActiveIdentity,
	broadcastId: string,
) {
	authorize(identity);
	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		authorize(live);
		if (!live) fail("BROADCAST_ACCESS_DENIED", "FORBIDDEN");
		const now = await databaseTime(tx);
		const [row] = await tx
			.select({ ...fields, createdByUserId: broadcasts.createdByUserId })
			.from(broadcasts)
			.innerJoin(user, eq(user.id, broadcasts.createdByUserId))
			.where(eq(broadcasts.id, broadcastId));
		if (!row) fail("BROADCAST_NOT_FOUND", "NOT_FOUND");
		return dto(row, live, now);
	});
}
export function resolveBroadcastExpiry(
	value: string | undefined,
	publishedAt: Date,
	now: Date,
	current?: Date,
) {
	const expiry = value
		? new Date(value)
		: (current ?? new Date(publishedAt.getTime() + sevenDays));
	if (
		!Number.isFinite(expiry.getTime()) ||
		expiry <= now ||
		expiry <= publishedAt
	)
		fail("BROADCAST_EXPIRATION_INVALID", "BAD_REQUEST");
	if (expiry.getTime() > publishedAt.getTime() + sevenDays)
		fail("BROADCAST_EXPIRATION_EXCEEDS_SEVEN_DAYS", "BAD_REQUEST");
	return expiry;
}

// Serialize update/archive on this broadcast, then lock and reload live authority.
async function write<T>(
	db: Database,
	identity: ActiveIdentity,
	broadcastId: string | null,
	action: (
		tx: DatabaseTransaction,
		live: ActiveIdentity,
		now: Date,
		row?: BroadcastRow,
	) => Promise<T>,
) {
	authorize(identity, true);
	try {
		return await db.transaction(async (tx) => {
			const [row] = broadcastId
				? await tx
						.select()
						.from(broadcasts)
						.where(eq(broadcasts.id, broadcastId))
						.for("update")
				: [];
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live, true);
			if (!live) fail("BROADCAST_ACCESS_DENIED", "FORBIDDEN");
			if (broadcastId && !row) fail("BROADCAST_NOT_FOUND", "NOT_FOUND");
			if (row && !canOwn(live, row.createdByUserId))
				fail("BROADCAST_NOT_OWNER", "FORBIDDEN");
			const now = await databaseTime(tx);
			if (row?.archivedAt) fail("BROADCAST_ALREADY_ARCHIVED", "CONFLICT");
			if (row && !isBroadcastActive(row, now))
				fail("BROADCAST_EXPIRED", "CONFLICT");
			return action(tx, live, now, row);
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "BROADCAST_REQUEST_FAILED",
		});
	}
}
type BroadcastInput = z.infer<typeof broadcastFieldsSchema>;
export function createBroadcast(
	db: Database,
	identity: ActiveIdentity,
	input: BroadcastInput,
) {
	return write(db, identity, null, async (tx, live, now) => {
		const [row] = await tx
			.insert(broadcasts)
			.values({
				title: input.title,
				content: input.content,
				linkUrl: input.linkUrl ?? null,
				createdByUserId: live.userId,
				publishedAt: now,
				expiresAt: resolveBroadcastExpiry(input.expiresAt, now, now),
				createdAt: now,
				updatedAt: now,
			})
			.returning({
				id: broadcasts.id,
				publishedAt: broadcasts.publishedAt,
				expiresAt: broadcasts.expiresAt,
			});
		if (!row) throw Error("Missing broadcast");
		return row;
	});
}
export function updateBroadcast(
	db: Database,
	identity: ActiveIdentity,
	broadcastId: string,
	input: BroadcastInput,
) {
	return write(db, identity, broadcastId, async (tx, live, now, row) => {
		if (!row) fail("BROADCAST_NOT_FOUND", "NOT_FOUND");
		await tx
			.update(broadcasts)
			.set({
				title: input.title,
				content: input.content,
				linkUrl: input.linkUrl ?? null,
				expiresAt: resolveBroadcastExpiry(
					input.expiresAt,
					row.publishedAt,
					now,
					row.expiresAt,
				),
				updatedByUserId: live.userId,
				updatedAt: now,
			})
			.where(eq(broadcasts.id, broadcastId));
		return { success: true as const };
	});
}
export function archiveBroadcast(
	db: Database,
	identity: ActiveIdentity,
	broadcastId: string,
) {
	return write(db, identity, broadcastId, async (tx, live, now) => {
		await tx
			.update(broadcasts)
			.set({ archivedAt: now, updatedAt: now, updatedByUserId: live.userId })
			.where(eq(broadcasts.id, broadcastId));
		return { success: true as const };
	});
}
