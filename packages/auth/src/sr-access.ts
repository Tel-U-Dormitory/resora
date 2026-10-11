import type { Database } from "@resora/db";
import { user } from "@resora/db/schema/auth";
import { srProfiles, userProfiles } from "@resora/db/schema/identity";
import { eq } from "drizzle-orm";

// Read current identity on every request; a session is not an active-account claim.
export async function getActiveSr(database: Database, userId: string) {
	const [profile] = await database
		.select({
			userId: userProfiles.userId,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
			mustChangePassword: userProfiles.mustChangePassword,
			nim: user.username,
		})
		.from(userProfiles)
		.innerJoin(srProfiles, eq(srProfiles.userId, userProfiles.userId))
		.innerJoin(user, eq(user.id, userProfiles.userId))
		.where(eq(userProfiles.userId, userId));
	if (profile?.actor !== "SR" || !profile.isActive || !profile.nim?.trim()) {
		return null;
	}
	return {
		userId: profile.userId,
		nim: profile.nim,
		mustChangePassword: profile.mustChangePassword,
	};
}
