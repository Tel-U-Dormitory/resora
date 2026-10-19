import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	accountAuditLogs,
	srPeriodMemberships,
	srPeriods,
	srProfiles,
} from "@resora/db/schema/identity";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	assignPeriodSchema,
	createPeriodSchema,
	extendPeriodSchema,
} from "./account-period.schema";
import { getLiveOperationalIdentity } from "./identity.public";
import { hasSuperadminPrivilege } from "./identity-policy";

function requireAdmin(identity: ActiveIdentity | null) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN", message: "SUPERADMIN_REQUIRED" });
}
async function authorizeWrite(
	tx: DatabaseTransaction,
	identity: ActiveIdentity,
) {
	// Serialize period edits/assignments. Does not block ordinary application requests.
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtext('resora:sr-period-administration'))`,
	);
	requireAdmin(await getLiveOperationalIdentity(tx, identity.userId));
}
export async function listPeriods(db: Database, identity: ActiveIdentity) {
	requireAdmin(identity);
	return db
		.select()
		.from(srPeriods)
		.orderBy(asc(srPeriods.startsOn), asc(srPeriods.id));
}
export async function createPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof createPeriodSchema>,
) {
	requireAdmin(identity);
	const data = createPeriodSchema.parse(input);
	return db.transaction(async (tx) => {
		await authorizeWrite(tx, identity);
		const [duplicate] = await tx
			.select({ id: srPeriods.id })
			.from(srPeriods)
			.where(eq(srPeriods.name, data.name));
		if (duplicate)
			throw new TRPCError({ code: "CONFLICT", message: "PERIOD_NAME_EXISTS" });
		const [period] = await tx.insert(srPeriods).values(data).returning();
		if (!period) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		await tx
			.insert(accountAuditLogs)
			.values({
				actorUserId: identity.userId,
				targetUserId: identity.userId,
				action: "PERIOD_CREATED",
				details: { period },
			});
		return period;
	});
}
export async function extendPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof extendPeriodSchema>,
) {
	requireAdmin(identity);
	const data = extendPeriodSchema.parse(input);
	return db.transaction(async (tx) => {
		await authorizeWrite(tx, identity);
		const [period] = await tx
			.select()
			.from(srPeriods)
			.where(eq(srPeriods.id, data.periodId))
			.for("update");
		if (!period)
			throw new TRPCError({ code: "NOT_FOUND", message: "PERIOD_NOT_FOUND" });
		if (data.endsOn <= period.endsOn)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "PERIOD_MUST_EXTEND",
			});
		await tx
			.update(srPeriods)
			.set({ endsOn: data.endsOn })
			.where(eq(srPeriods.id, period.id));
		await tx
			.insert(accountAuditLogs)
			.values({
				actorUserId: identity.userId,
				targetUserId: identity.userId,
				action: "PERIOD_EXTENDED",
				details: {
					periodId: period.id,
					before: period.endsOn,
					after: data.endsOn,
				},
			});
		return { periodId: period.id };
	});
}
export async function assignPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof assignPeriodSchema>,
) {
	requireAdmin(identity);
	const data = assignPeriodSchema.parse(input);
	const userIds = [...new Set(data.userIds)].sort();
	return db.transaction(async (tx) => {
		await authorizeWrite(tx, identity);
		const [period] = await tx
			.select()
			.from(srPeriods)
			.where(eq(srPeriods.id, data.periodId))
			.for("share");
		if (!period)
			throw new TRPCError({ code: "NOT_FOUND", message: "PERIOD_NOT_FOUND" });
		const targets = await tx
			.select({ userId: srProfiles.userId })
			.from(srProfiles)
			.where(inArray(srProfiles.userId, userIds))
			.orderBy(asc(srProfiles.userId))
			.for("update");
		if (targets.length !== userIds.length)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "SR_ACCOUNT_NOT_FOUND",
			});
		let assigned = 0;
		for (const userId of userIds) {
			const inserted = await tx
				.insert(srPeriodMemberships)
				.values({ userId, periodId: period.id })
				.onConflictDoNothing()
				.returning();
			if (!inserted.length) continue;
			assigned++;
			await tx
				.insert(accountAuditLogs)
				.values({
					actorUserId: identity.userId,
					targetUserId: userId,
					action: "PERIOD_ASSIGNED",
					details: { periodId: period.id },
				});
		}
		return { assigned };
	});
}
