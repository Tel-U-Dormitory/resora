import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { user } from "@resora/db/schema/auth";
import {
	accountAuditLogs,
	srProfiles,
	userPermissionGrants,
	userProfiles,
} from "@resora/db/schema/identity";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getLiveOperationalIdentity } from "./identity.public";
import { hasSuperadminPrivilege } from "./identity-policy";
import {
	applicablePermissions,
	manualPermissionState,
	permissionCatalog,
	permissionCodes,
} from "./permission-catalog";

export const accountPermissionsSchema = z
	.object({ userId: z.string().trim().min(1).max(128) })
	.strict();
export const setAccountPermissionSchema = accountPermissionsSchema
	.extend({
		permissionCode: z.enum(permissionCodes),
		enabled: z.boolean(),
	})
	.strict();

function requireAdmin(identity: ActiveIdentity | null) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN", message: "SUPERADMIN_REQUIRED" });
}

async function readPermissions(tx: DatabaseTransaction, userId: string) {
	const live = await getLiveOperationalIdentity(tx, userId);
	const [target] = await tx
		.select({
			userId: user.id,
			name: user.name,
			nim: user.username,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
			departmentCode: srProfiles.departmentCode,
			positionCode: srProfiles.positionCode,
		})
		.from(user)
		.leftJoin(userProfiles, eq(userProfiles.userId, user.id))
		.leftJoin(srProfiles, eq(srProfiles.userId, user.id))
		.where(eq(user.id, userId));
	if (!target)
		throw new TRPCError({ code: "NOT_FOUND", message: "ACCOUNT_NOT_FOUND" });
	const [grant] = await tx
		.select()
		.from(userPermissionGrants)
		.where(
			and(
				eq(userPermissionGrants.userId, userId),
				eq(userPermissionGrants.permissionCode, permissionCodes[0]),
			),
		);
	const explicit = Boolean(grant && !grant.revokedAt);
	return {
		target,
		catalog: applicablePermissions(target.departmentCode),
		permission: {
			code: permissionCodes[0],
			label: permissionCatalog[0].label,
			description: permissionCatalog[0].description,
			...manualPermissionState(live, explicit),
			grantedAt: grant?.grantedAt ?? null,
			revokedAt: grant?.revokedAt ?? null,
		},
	};
}

export async function getPermissionCatalog(
	db: Database,
	identity: ActiveIdentity,
) {
	requireAdmin(identity);
	return db.transaction(async (tx) => {
		requireAdmin(await getLiveOperationalIdentity(tx, identity.userId));
		return permissionCatalog;
	});
}

export async function accountPermissions(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof accountPermissionsSchema>,
) {
	requireAdmin(identity);
	const { userId } = accountPermissionsSchema.parse(input);
	return db.transaction(async (tx) => {
		requireAdmin(await getLiveOperationalIdentity(tx, identity.userId));
		return readPermissions(tx, userId);
	});
}

export async function setAccountPermission(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof setAccountPermissionSchema>,
) {
	requireAdmin(identity);
	const data = setAccountPermissionSchema.parse(input);
	return db.transaction(async (tx) => {
		// Serialize even first grants (no row yet). No event/session lock is taken.
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resora:permission:${data.userId}:${data.permissionCode}`}, 0))`,
		);
		requireAdmin(await getLiveOperationalIdentity(tx, identity.userId));
		const before = await readPermissions(tx, data.userId);
		if (data.enabled && before.permission.intrinsic)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "PERMISSION_ALREADY_INTRINSIC",
			});
		if (data.enabled && !before.permission.eligibleForGrant)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "PERMISSION_TARGET_INELIGIBLE",
			});
		const match = and(
			eq(userPermissionGrants.userId, data.userId),
			eq(userPermissionGrants.permissionCode, data.permissionCode),
		);
		const [existing] = await tx
			.select()
			.from(userPermissionGrants)
			.where(match)
			.for("update");
		if (Boolean(existing && !existing.revokedAt) === data.enabled)
			return { changed: false, ...before };
		const {
			rows: [clock],
		} = await tx.execute<{ now: Date }>(sql`select clock_timestamp() now`);
		if (!clock) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		const now = new Date(clock.now);
		if (data.enabled) {
			await tx
				.insert(userPermissionGrants)
				.values({
					userId: data.userId,
					permissionCode: data.permissionCode,
					grantedByUserId: identity.userId,
					grantedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						userPermissionGrants.userId,
						userPermissionGrants.permissionCode,
					],
					set: {
						grantedByUserId: identity.userId,
						grantedAt: now,
						revokedAt: null,
						revokedByUserId: null,
					},
				});
		} else {
			await tx
				.update(userPermissionGrants)
				.set({ revokedByUserId: identity.userId, revokedAt: now })
				.where(match);
		}
		await tx.insert(accountAuditLogs).values({
			actorUserId: identity.userId,
			targetUserId: data.userId,
			action: data.enabled
				? "ACCOUNT_PERMISSION_GRANTED"
				: "ACCOUNT_PERMISSION_REVOKED",
			details: {
				permissionCode: data.permissionCode,
				before: { active: before.permission.explicit },
				after: { active: data.enabled },
			},
			createdAt: now,
		});
		return { changed: true, ...(await readPermissions(tx, data.userId)) };
	});
}
