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
	srPeriodMemberships,
	srPeriods,
	srProfiles,
	systemPrivileges,
	userPermissionGrants,
	userProfiles,
} from "@resora/db/schema/identity";
import { srTenureStatus } from "@resora/db/sr-tenure";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { canManageInternalAttendanceManually } from "./identity-policy";
import { eligibleForManualGrant } from "./permission-catalog";

export { isValidSrAssignment } from "@resora/db/organization";
export {
	canAccessPersonalSr,
	canManageBroadcast,
	canManageCommittee,
	canManageEventScoring,
	canManageInternalAttendanceManually,
	canManageInternalEvent,
	canReadAttendancePoints,
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

// Narrow reference-data contract for modules that need selectable active buildings.
export async function getActiveBuildings(db: Database | DatabaseTransaction) {
	return db
		.select({ id: buildings.id, code: buildings.code, name: buildings.name })
		.from(buildings)
		.where(eq(buildings.isActive, true))
		.orderBy(asc(buildings.code));
}

export async function getActiveBuilding(
	db: Database | DatabaseTransaction,
	buildingId: string,
	lock = false,
) {
	const query = db
		.select({ id: buildings.id, name: buildings.name })
		.from(buildings)
		.where(and(eq(buildings.id, buildingId), eq(buildings.isActive, true)));
	const [building] = await (lock ? query.for("share") : query);
	return building ?? null;
}

// Read-only counterpart for consistent reports; write authorization still uses live locks.
export async function readOperationalIdentity(
	db: Database | DatabaseTransaction,
	userId: string,
) {
	const identity = await getActiveIdentity(db, userId);
	if (!identity || requiresPasswordChange(identity)) return null;
	if (
		identity.actor === "SR" &&
		!(await readActiveSrDirectory(db, false, userId)).candidates.length
	)
		return null;
	return identity;
}

// Trusted report queries: callers authorize access; historical membership is not an active directory.
export async function readSrPeriod(
	db: Database | DatabaseTransaction,
	periodId: string,
) {
	const [period] = await db
		.select({
			id: srPeriods.id,
			name: srPeriods.name,
			startsOn: srPeriods.startsOn,
			endsOn: srPeriods.endsOn,
		})
		.from(srPeriods)
		.where(eq(srPeriods.id, periodId));
	return period ?? null;
}

export async function readSrPeriodRoster(
	db: Database | DatabaseTransaction,
	periodId: string,
) {
	return db
		.select({
			userId: user.id,
			nim: user.username,
			name: user.name,
			currentDepartmentCode: srProfiles.departmentCode,
			currentDepartmentName: departments.name,
			currentBuildingCode: buildings.code,
			currentBuildingName: buildings.name,
		})
		.from(srPeriodMemberships)
		.innerJoin(srProfiles, eq(srProfiles.userId, srPeriodMemberships.userId))
		.innerJoin(userProfiles, eq(userProfiles.userId, srProfiles.userId))
		.innerJoin(user, eq(user.id, srProfiles.userId))
		.leftJoin(departments, eq(departments.code, srProfiles.departmentCode))
		.leftJoin(buildings, eq(buildings.id, srProfiles.buildingId))
		.where(
			and(
				eq(srPeriodMemberships.periodId, periodId),
				eq(userProfiles.actor, "SR"),
			),
		)
		.orderBy(asc(user.username), asc(user.id));
}

export async function readSrPeriodEvaluationRoster(
	db: Database | DatabaseTransaction,
	periodId: string,
) {
	return db
		.select({
			userId: user.id,
			nim: user.username,
			name: user.name,
			isActive: userProfiles.isActive,
			currentDepartmentCode: srProfiles.departmentCode,
			currentDepartmentName: departments.name,
			currentPositionCode: srProfiles.positionCode,
			currentBuildingCode: buildings.code,
			currentBuildingName: buildings.name,
		})
		.from(srPeriodMemberships)
		.innerJoin(srProfiles, eq(srProfiles.userId, srPeriodMemberships.userId))
		.innerJoin(userProfiles, eq(userProfiles.userId, srProfiles.userId))
		.innerJoin(user, eq(user.id, srProfiles.userId))
		.leftJoin(departments, eq(departments.code, srProfiles.departmentCode))
		.leftJoin(buildings, eq(buildings.id, srProfiles.buildingId))
		.where(
			and(
				eq(srPeriodMemberships.periodId, periodId),
				eq(userProfiles.actor, "SR"),
			),
		)
		.orderBy(asc(user.username), asc(user.id));
}

// Reporting options only; account-period administration retains its own SUPERADMIN gate.
export async function readScoringPeriods(db: Database | DatabaseTransaction) {
	return db
		.select({
			periodId: srPeriods.id,
			name: srPeriods.name,
			startsOn: srPeriods.startsOn,
			endsOn: srPeriods.endsOn,
		})
		.from(srPeriods)
		.orderBy(asc(srPeriods.startsOn), asc(srPeriods.id));
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

// The caller supplies a fresh backend identity. Writes call this after live
// identity/event/session locks, with a row SHARE lock held until commit.
export async function canManageManualAttendance(
	db: Database | DatabaseTransaction,
	identity: ActiveIdentity | null | undefined,
	lock = false,
) {
	if (canManageInternalAttendanceManually(identity)) return true;
	if (!identity || !eligibleForManualGrant(identity)) return false;
	const query = db
		.select({ userId: userPermissionGrants.userId })
		.from(userPermissionGrants)
		.where(
			and(
				eq(userPermissionGrants.userId, identity.userId),
				eq(userPermissionGrants.permissionCode, "ATTENDANCE_MANUAL_MANAGE"),
				isNull(userPermissionGrants.revokedAt),
			),
		);
	const rows = await (lock ? query.for("share") : query);
	return rows.length > 0;
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

// Trusted server read contract for already-authorized audit/Broadcast consumers.
// Include inactive/archived accounts: historical author names remain readable.
export async function getUserDisplayNames(
	db: Database | DatabaseTransaction,
	userIds: readonly string[],
): Promise<Map<string, string>> {
	if (!userIds.length) return new Map();
	const rows = await db
		.select({ userId: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, [...new Set(userIds)]));
	return new Map(rows.map((row) => [row.userId, row.name]));
}

export type { ActiveIdentity, ActiveSrIdentity } from "@resora/auth/sr-access";
