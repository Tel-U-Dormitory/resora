import type { Database, DatabaseTransaction } from "@resora/db";
import { isValidSrAssignment } from "@resora/db/organization";
import { user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	userProfiles,
} from "@resora/db/schema/identity";
import { and, eq } from "drizzle-orm";

export { isValidSrAssignment } from "@resora/db/organization";
export { canAccessPersonalSr, canManageInternalEvent } from "./identity-policy";

// Backend-only directory contract. Attendance must not read Identity's tables itself.
export async function getActiveSrDirectory(
	db: Database | DatabaseTransaction,
	lock = false,
) {
	const query = db
		.select({
			userId: user.id,
			nim: user.username,
			name: user.name,
			departmentCode: srProfiles.departmentCode,
			positionCode: srProfiles.positionCode,
			buildingId: buildings.id,
			buildingCode: buildings.code,
			buildingName: buildings.name,
		})
		.from(userProfiles)
		.innerJoin(user, eq(user.id, userProfiles.userId))
		.innerJoin(srProfiles, eq(srProfiles.userId, userProfiles.userId))
		.innerJoin(departments, eq(departments.code, srProfiles.departmentCode))
		.innerJoin(positions, eq(positions.code, srProfiles.positionCode))
		.innerJoin(buildings, eq(buildings.id, srProfiles.buildingId))
		.where(
			and(
				eq(userProfiles.actor, "SR"),
				eq(userProfiles.isActive, true),
				eq(departments.isActive, true),
				eq(positions.isActive, true),
				eq(buildings.isActive, true),
			),
		);
	// FOR SHARE prevents concurrent assignment/deactivation from invalidating publication's view.
	const rows = await (lock ? query.for("share") : query);
	const candidates: SrCandidate[] = [];
	let invalidAssignmentCount = 0;
	for (const row of rows) {
		if (
			!row.nim?.trim() ||
			!isValidSrAssignment(row.departmentCode, row.positionCode)
		) {
			invalidAssignmentCount++;
			continue;
		}
		candidates.push({ ...row, nim: row.nim });
	}
	return { candidates, invalidAssignmentCount };
}
export type SrCandidate = {
	userId: string;
	nim: string;
	name: string;
	departmentCode: string;
	positionCode: string;
	buildingId: string;
	buildingCode: string;
	buildingName: string;
};
