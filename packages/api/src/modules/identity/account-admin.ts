import { randomBytes } from "node:crypto";
import { type AuthConfig, createAuth } from "@resora/auth";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { isValidSrAssignment } from "@resora/db/organization";
import { account, session, user } from "@resora/db/schema/auth";
import {
	accountAuditLogs,
	buildings,
	departments,
	positions,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	createAccountSchema,
	listAccountsSchema,
	resetAccountPasswordSchema,
} from "./account-admin.schema";
import { getLiveOperationalIdentity } from "./identity.public";
import { hasSuperadminPrivilege } from "./identity-policy";
import { createSrAccount } from "./sr-account";

function requireAdmin(identity: ActiveIdentity | null) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN", message: "SUPERADMIN_REQUIRED" });
}

export async function accountReferences(
	db: Database,
	identity: ActiveIdentity,
) {
	requireAdmin(identity);
	const departmentRows = await db
		.select({ code: departments.code, name: departments.name })
		.from(departments)
		.where(eq(departments.isActive, true))
		.orderBy(asc(departments.code));
	const positionRows = await db
		.select({ code: positions.code, name: positions.name })
		.from(positions)
		.where(eq(positions.isActive, true))
		.orderBy(asc(positions.code));
	const buildingRows = await db
		.select({ code: buildings.code, name: buildings.name })
		.from(buildings)
		.where(eq(buildings.isActive, true))
		.orderBy(asc(buildings.code));
	return {
		departments: departmentRows,
		positions: positionRows.map((position) => ({
			...position,
			departmentCodes: departmentRows
				.filter((department) =>
					isValidSrAssignment(department.code, position.code),
				)
				.map((department) => department.code),
		})),
		buildings: buildingRows,
	};
}

export async function listAccounts(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof listAccountsSchema>,
	snapshot = false,
) {
	requireAdmin(identity);
	const data = listAccountsSchema.parse(input);
	const search = `%${data.search.replace(/[\\%_]/g, "\\$&")}%`;
	const filter = and(
		eq(userProfiles.actor, "SR"),
		data.search
			? or(ilike(user.name, search), ilike(user.username, search))
			: undefined,
		data.departmentCode
			? eq(srProfiles.departmentCode, data.departmentCode)
			: undefined,
		data.isActive === undefined
			? undefined
			: eq(userProfiles.isActive, data.isActive),
	);
	return db.transaction(
		async (tx) => {
			const [count] = await tx
				.select({ total: sql<number>`count(*)::int` })
				.from(user)
				.innerJoin(userProfiles, eq(userProfiles.userId, user.id))
				.innerJoin(srProfiles, eq(srProfiles.userId, user.id))
				.where(filter);
			const query = tx
				.select({
					userId: user.id,
					nim: user.username,
					name: user.name,
					email: user.email,
					departmentCode: srProfiles.departmentCode,
					department: departments.name,
					positionCode: srProfiles.positionCode,
					position: positions.name,
					buildingCode: buildings.code,
					building: buildings.name,
					isActive: userProfiles.isActive,
					isSuperadmin: sql<boolean>`${systemPrivileges.userId} IS NOT NULL`,
				})
				.from(user)
				.innerJoin(userProfiles, eq(userProfiles.userId, user.id))
				.innerJoin(srProfiles, eq(srProfiles.userId, user.id))
				.leftJoin(departments, eq(departments.code, srProfiles.departmentCode))
				.leftJoin(positions, eq(positions.code, srProfiles.positionCode))
				.leftJoin(buildings, eq(buildings.id, srProfiles.buildingId))
				.leftJoin(
					systemPrivileges,
					and(
						eq(systemPrivileges.userId, user.id),
						eq(systemPrivileges.privilegeCode, "SUPERADMIN"),
					),
				)
				.where(filter)
				.orderBy(asc(user.username), asc(user.id));
			const accounts = snapshot
				? await query
				: await query
						.limit(data.pageSize)
						.offset((data.page - 1) * data.pageSize);
			return {
				accounts,
				total: count?.total ?? 0,
				page: data.page,
				pageSize: data.pageSize,
			};
		},
		{ accessMode: "read only", isolationLevel: "repeatable read" },
	);
}

export async function createAccount(
	db: Database,
	identity: ActiveIdentity,
	authConfig: AuthConfig | undefined,
	input: z.input<typeof createAccountSchema>,
) {
	requireAdmin(identity);
	const data = createAccountSchema.parse(input);
	if (!isValidSrAssignment(data.departmentCode, data.positionCode))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "INVALID_ORGANIZATION_ASSIGNMENT",
		});
	if (!authConfig) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	try {
		return await db.transaction(async (tx) => {
			requireAdmin(await getLiveOperationalIdentity(tx, identity.userId));
			// Share the existing CSV lock: normalized identity conflicts are checked before creation.
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtext('resora:sr-csv-provisioning'))`,
			);
			const [department] = await tx
				.select()
				.from(departments)
				.where(eq(departments.code, data.departmentCode))
				.for("share");
			const [position] = await tx
				.select()
				.from(positions)
				.where(eq(positions.code, data.positionCode))
				.for("share");
			const [building] = await tx
				.select()
				.from(buildings)
				.where(eq(buildings.code, data.buildingCode))
				.for("share");
			if (!department?.isActive || !position?.isActive || !building?.isActive)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "INVALID_OR_INACTIVE_ORGANIZATION_REFERENCE",
				});
			const existing = await tx
				.select({ nim: user.username, email: user.email })
				.from(user)
				.where(
					or(
						eq(user.username, data.nim),
						eq(sql`lower(${user.email})`, data.email),
					),
				);
			if (existing.some((row) => row.nim === data.nim))
				throw new TRPCError({ code: "CONFLICT", message: "NIM_EXISTS" });
			if (existing.length)
				throw new TRPCError({ code: "CONFLICT", message: "EMAIL_EXISTS" });
			const context = await createAuth(authConfig, tx).$context;
			const temporaryPassword = randomBytes(18).toString("base64url");
			const passwordHash = await context.password.hash(temporaryPassword);
			const userId = await createSrAccount(
				tx,
				context,
				{ ...data, buildingId: building.id, isActive: true },
				passwordHash,
			);
			await tx.insert(accountAuditLogs).values({
				actorUserId: identity.userId,
				targetUserId: userId,
				action: "ACCOUNT_CREATED",
			});
			await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
			// Returned only after the surrounding transaction commits, never stored in audit/DB.
			return {
				userId,
				name: data.name,
				nim: data.nim,
				email: data.email,
				temporaryPassword,
			};
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		const databaseError = error as {
			code?: string;
			cause?: { code?: string };
		} | null;
		if (
			databaseError?.code === "23505" ||
			databaseError?.cause?.code === "23505"
		)
			throw new TRPCError({ code: "CONFLICT", message: "NIM_OR_EMAIL_EXISTS" });
		// A lost commit acknowledgement cannot safely be reported as definitely rolled back.
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "ACCOUNT_CREATE_OUTCOME_UNCONFIRMED",
		});
	}
}

export async function resetAccountPassword(
	db: Database,
	identity: ActiveIdentity,
	authConfig: AuthConfig | undefined,
	input: z.input<typeof resetAccountPasswordSchema>,
) {
	requireAdmin(identity);
	const data = resetAccountPasswordSchema.parse(input);
	if (!authConfig) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return db.transaction(async (tx) => {
		requireAdmin(await getLiveOperationalIdentity(tx, identity.userId));
		const [target] = await tx
			.select({ userId: userProfiles.userId })
			.from(userProfiles)
			.where(
				and(eq(userProfiles.userId, data.userId), eq(userProfiles.actor, "SR")),
			)
			.for("update");
		if (!target)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "SR_ACCOUNT_NOT_FOUND",
			});
		const context = await createAuth(authConfig, tx).$context;
		const temporaryPassword = randomBytes(18).toString("base64url");
		const hash = await context.password.hash(temporaryPassword);
		const updated = await tx
			.update(account)
			.set({ password: hash })
			.where(
				and(
					eq(account.userId, data.userId),
					eq(account.providerId, "credential"),
				),
			)
			.returning({ id: account.id });
		if (updated.length !== 1)
			throw new TRPCError({
				code: "CONFLICT",
				message: "INVALID_CREDENTIAL_ACCOUNT",
			});
		await tx
			.update(userProfiles)
			.set({ mustChangePassword: true, passwordResetRequired: true })
			.where(eq(userProfiles.userId, data.userId));
		await tx.delete(session).where(eq(session.userId, data.userId));
		await tx
			.insert(accountAuditLogs)
			.values({
				actorUserId: identity.userId,
				targetUserId: data.userId,
				action: "PASSWORD_RESET",
			});
		return { temporaryPassword };
	});
}
