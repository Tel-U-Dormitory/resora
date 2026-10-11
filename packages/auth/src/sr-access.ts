import type { Database } from "@resora/db";
import { user } from "@resora/db/schema/auth";
import {
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { and, eq, sql } from "drizzle-orm";

// Read current identity on every request; a session is not an active-account claim.
export async function getActiveSr(
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
			isSuperadmin: sql<boolean>`${systemPrivileges.userId} IS NOT NULL`,
		})
		.from(userProfiles)
		.innerJoin(srProfiles, eq(srProfiles.userId, userProfiles.userId))
		.innerJoin(user, eq(user.id, userProfiles.userId))
		.leftJoin(
			systemPrivileges,
			and(
				eq(systemPrivileges.userId, userProfiles.userId),
				eq(systemPrivileges.privilegeCode, "SUPERADMIN"),
			),
		)
		.where(eq(userProfiles.userId, userId));
	if (profile?.actor !== "SR" || !profile.isActive || !profile.nim?.trim()) {
		return null;
	}
	return { ...profile, actor: profile.actor, nim: profile.nim };
}

export type ActiveSrIdentity = NonNullable<
	Awaited<ReturnType<typeof getActiveSr>>
>;
