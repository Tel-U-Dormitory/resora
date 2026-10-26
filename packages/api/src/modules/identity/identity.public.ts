import {
	type ActiveIdentity,
	getActiveIdentity,
	requiresPasswordChange,
} from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { isValidSrAssignment } from "@resora/db/organization";
import { user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { srTenureStatus } from "@resora/db/sr-tenure";
import { and, eq, inArray } from "drizzle-orm";

export { isValidSrAssignment } from "@resora/db/organization";
export {
	canAccessPersonalSr,
	canManageBroadcast,
	canManageCommittee,
	canManageInternalAttendanceManually,
	canManageInternalEvent,
	canReadBroadcast,
	hasSuperadminPrivilege,
} from "./identity-policy";

// Backend-only directory contract. Attendance must not read Identity's tables itself.
async function readActiveSrDirectory(
	db: Database | DatabaseTransaction,
	lock = false,
	userId?: string,
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
			mustChangePassword: userProfiles.mustChangePassword,
			passwordResetRequired: userProfiles.passwordResetRequired,
		})
		.from(userProfiles)
		.innerJoin(user, eq(user.id, userProfiles.userId))
		.innerJoin(srProfiles, eq(srProfiles.userId, userProfiles.userId))
		.innerJoin(departments, eq(departments.code, srProfiles.departmentCode))
		.innerJoin(positions, eq(positions.code, srProfiles.positionCode))
		.innerJoin(buildings, eq(buildings.id, srProfiles.buildingId))
		.where(
			and(
				userId ? eq(userProfiles.userId, userId) : undefined,
				eq(userProfiles.actor, "SR"),
				eq(userProfiles.isActive, true),
				eq(srTenureStatus(userProfiles.userId), "ACTIVE"),
				eq(departments.isActive, true),
				eq(positions.isActive, true),
				eq(buildings.isActive, true),
			),
		);
	// FOR SHARE prevents concurrent assignment/deactivation from invalidating publication's view.
	let rows = await (lock ? query.for("share") : query);
	if (lock) {
		// Re-evaluate statement time after potentially waiting for profile/reference locks.
		rows = await query;
	}
	const candidates: (SrCandidate & {
		mustChangePassword: boolean;
		passwordResetRequired?: boolean;
	})[] = [];
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

export async function getActiveSrDirectory(
	db: Database | DatabaseTransaction,
	lock = false,
) {
	const { candidates, invalidAssignmentCount } = await readActiveSrDirectory(
		db,
		lock,
	);
	return {
		candidates: candidates.map(
			({
				mustChangePassword: _gate,
				passwordResetRequired: _reset,
				...candidate
			}) => candidate,
		),
		invalidAssignmentCount,
	};
}

// Lock only the target's live identity/assignment/reference rows during check-in.
// Regular SR may scan with initial credentials; privileged SR retain the live gate.
export async function getCheckInSr(
	db: Database | DatabaseTransaction,
	userId: string,
) {
	const { candidates } = await readActiveSrDirectory(db, true, userId);
	const candidate = candidates[0];
	if (!candidate) return null;
	const grants = await db
		.select({ userId: systemPrivileges.userId })
		.from(systemPrivileges)
		.where(
			and(
				eq(systemPrivileges.userId, userId),
				eq(systemPrivileges.privilegeCode, "SUPERADMIN"),
			),
		)
		.for("share");
	return requiresPasswordChange({
		actor: "SR",
		mustChangePassword: candidate.mustChangePassword,
		passwordResetRequired: candidate.passwordResetRequired,
		isSuperadmin: grants.length > 0,
	})
		? null
		: candidate;
}

// Call after event/session locks: reload eligible identity and the latest explicit grant.
// Share-lock a present grant so its revocation cannot commit during an authorized write.
export async function getLiveOperationalIdentity(
	tx: DatabaseTransaction,
	userId: string,
): Promise<ActiveIdentity | null> {
	const [profile] = await tx
		.select({ userId: userProfiles.userId })
		.from(userProfiles)
		.where(eq(userProfiles.userId, userId))
		.for("share");
	if (!profile) return null;
	await tx
		.select({ userId: user.id })
		.from(user)
		.where(eq(user.id, userId))
		.for("share");
	await tx
		.select({ userId: systemPrivileges.userId })
		.from(systemPrivileges)
		.where(
			and(
				eq(systemPrivileges.userId, userId),
				eq(systemPrivileges.privilegeCode, "SUPERADMIN"),
			),
		)
		.for("share");
	const identity = await getActiveIdentity(tx, userId);
	if (!identity || requiresPasswordChange(identity)) return null;
	if (identity.actor === "SR" && !(await getActiveSrCandidate(tx, userId)))
		return null;
	return identity;
}

// Manual insertion needs an active eligible target, not completion of their first login.
export async function getActiveSrCandidate(
	db: Database | DatabaseTransaction,
	userId: string,
) {
	const { candidates } = await readActiveSrDirectory(db, true, userId);
	return candidates[0] ?? null;
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

// Membership management must still identify inactive/expired SR without exposing auth data.
export async function getSrMemberIdentities(
	db: Database | DatabaseTransaction,
	userIds: string[],
) {
	if (!userIds.length) return [];
	return db
		.select({ userId: user.id, name: user.name, nim: user.username })
		.from(user)
		.innerJoin(srProfiles, eq(srProfiles.userId, user.id))
		.where(inArray(user.id, userIds));
}
