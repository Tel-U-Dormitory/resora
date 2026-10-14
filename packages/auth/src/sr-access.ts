import type { Database } from "@resora/db";
import { user } from "@resora/db/schema/auth";
import {
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { and, eq, sql } from "drizzle-orm";

// Read current identity on every request; a session is not an active-account claim.
export async function getActiveIdentity(
	database: Pick<Database, "select">,
	userId: string,
) {
	const [profile] = await database
		.select({
			userId: userProfiles.userId,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
			mustChangePassword: userProfiles.mustChangePassword,
			nim: user.username,
			departmentCode: srProfiles.departmentCode,
			positionCode: srProfiles.positionCode,
			buildingId: srProfiles.buildingId,
			srUserId: srProfiles.userId,
			isSuperadmin: sql<boolean>`${systemPrivileges.userId} IS NOT NULL`,
		})
		.from(userProfiles)
		.leftJoin(srProfiles, eq(srProfiles.userId, userProfiles.userId))
		.innerJoin(user, eq(user.id, userProfiles.userId))
		.leftJoin(
			systemPrivileges,
			and(
				eq(systemPrivileges.userId, userProfiles.userId),
				eq(systemPrivileges.privilegeCode, "SUPERADMIN"),
			),
		)
		.where(eq(userProfiles.userId, userId));
	if (!profile?.isActive || !profile.nim?.trim()) return null;
	const common = {
		userId: profile.userId,
		isActive: profile.isActive as boolean,
		mustChangePassword: profile.mustChangePassword,
	};
	if (
		profile.actor === "SR" &&
		profile.departmentCode &&
		profile.positionCode &&
		profile.buildingId
	)
		return {
			...common,
			actor: "SR" as const,
			nim: profile.nim,
			departmentCode: profile.departmentCode,
			positionCode: profile.positionCode,
			buildingId: profile.buildingId,
			isSuperadmin: profile.isSuperadmin,
		};
	if (
		profile.actor === "SYSTEM_ADMIN" &&
		profile.isSuperadmin &&
		!profile.srUserId
	)
		return {
			...common,
			actor: "SYSTEM_ADMIN" as const,
			username: profile.nim,
			isSuperadmin: true as const,
		};
	return null;
}

// Participant-only contract remains separate from operational authentication.
export async function getActiveSr(
	database: Pick<Database, "select">,
	userId: string,
) {
	const identity = await getActiveIdentity(database, userId);
	return identity?.actor === "SR" ? identity : null;
}

export type ActiveIdentity = NonNullable<
	Awaited<ReturnType<typeof getActiveIdentity>>
>;

export type ActiveSrIdentity = NonNullable<
	Awaited<ReturnType<typeof getActiveSr>>
>;
