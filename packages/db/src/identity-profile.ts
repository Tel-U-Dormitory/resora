import { eq } from "drizzle-orm";
import type { Database } from "./index";
import { user } from "./schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	userProfiles,
} from "./schema/identity";

/** Only the signed-in account is queried; never accept a client-selected user ID. */
export async function findIdentityProfile(db: Database, userId: string) {
	const [profile] = await db
		.select({
			id: user.id,
			nim: user.username,
			name: user.name,
			email: user.email,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
			departmentCode: srProfiles.departmentCode,
			departmentName: departments.name,
			positionCode: srProfiles.positionCode,
			positionName: positions.name,
			buildingName: buildings.name,
		})
		.from(user)
		.innerJoin(userProfiles, eq(user.id, userProfiles.userId))
		.innerJoin(srProfiles, eq(user.id, srProfiles.userId))
		.innerJoin(departments, eq(srProfiles.departmentCode, departments.code))
		.innerJoin(positions, eq(srProfiles.positionCode, positions.code))
		.innerJoin(buildings, eq(srProfiles.buildingId, buildings.id))
		.where(eq(user.id, userId));
	return profile;
}
