import { randomBytes } from "node:crypto";
import { type AuthConfig, createAuth } from "@resora/auth";
import {
	type ActiveIdentity,
	getActiveIdentity,
	requiresPasswordChange,
} from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import { isValidSrAssignment } from "@resora/db/organization";
import { account, session, user } from "@resora/db/schema/auth";
import {
	accountAuditLogs,
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
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { canManageInternalAttendanceManually } from "./identity-policy";
import { eligibleForManualGrant } from "./permission-catalog";

export { isValidSrAssignment } from "@resora/db/organization";
export {
	canAccessPersonalDt,
	canAccessPersonalSr,
	canManageBroadcast,
	canManageCommittee,
	canManageDt,
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

export async function getActiveDepartments(db: Database | DatabaseTransaction) {
	return db
		.select({ code: departments.code, name: departments.name })
		.from(departments)
		.where(eq(departments.isActive, true))
		.orderBy(asc(departments.code));
}

export async function getActiveDepartment(
	db: Database | DatabaseTransaction,
	code: string,
	lock = false,
) {
	const query = db
		.select({ code: departments.code, name: departments.name })
		.from(departments)
		.where(and(eq(departments.code, code), eq(departments.isActive, true)));
	const [row] = await (lock ? query.for("share") : query);
	return row ?? null;
}

export async function getMemberIdentities(
	db: Database | DatabaseTransaction,
	userIds: readonly string[],
) {
	if (!userIds.length) return [];
	return db
		.select({
			userId: user.id,
			name: user.name,
			nim: user.username,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
		})
		.from(user)
		.innerJoin(userProfiles, eq(userProfiles.userId, user.id))
		.where(inArray(user.id, [...new Set(userIds)]));
}

export async function getDtAccountIdentities(
	db: Database | DatabaseTransaction,
	userIds: readonly string[],
) {
	if (!userIds.length) return [];
	return db
		.select({
			userId: user.id,
			name: user.name,
			nim: user.username,
			email: user.email,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
		})
		.from(user)
		.innerJoin(userProfiles, eq(userProfiles.userId, user.id))
		.where(inArray(user.id, [...new Set(userIds)]));
}

export async function findExistingIdentityByNimOrEmail(
	tx: DatabaseTransaction,
	nim: string,
	email: string,
) {
	return tx
		.select({
			userId: user.id,
			nim: user.username,
			email: user.email,
			name: user.name,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
		})
		.from(user)
		.leftJoin(userProfiles, eq(userProfiles.userId, user.id))
		.where(or(eq(user.username, nim), eq(sql`lower(${user.email})`, email)));
}

export async function provisionDtUser(
	tx: DatabaseTransaction,
	authConfig: AuthConfig,
	input: { name: string; nim: string; email: string },
) {
	const context = await createAuth(authConfig, tx).$context;
	const placeholderSecret = randomBytes(24).toString("base64url");
	const passwordHash = await context.password.hash(placeholderSecret);
	const created = await context.internalAdapter.createUser(
		{
			name: input.name,
			email: input.email,
			emailVerified: false,
			username: input.nim,
			displayUsername: input.nim,
		},
		{ method: "dt-admin" },
	);
	if (!created?.id) throw new Error("AUTH_ACCOUNT_CREATION_FAILED");
	const linked = await context.internalAdapter.linkAccount({
		userId: created.id,
		accountId: created.id,
		providerId: "credential",
		password: passwordHash,
	});
	if (!linked?.id) throw new Error("AUTH_ACCOUNT_CREATION_FAILED");
	await tx.insert(userProfiles).values({
		userId: created.id,
		actor: "DT",
		isActive: true,
		mustChangePassword: true,
	});
	return created.id;
}

export async function issueDtTemporaryPassword(
	tx: DatabaseTransaction,
	authConfig: AuthConfig,
	userId: string,
	forceRotation = false,
) {
	const context = await createAuth(authConfig, tx).$context;
	const temporaryPassword = randomBytes(18).toString("base64url");
	const passwordHash = await context.password.hash(temporaryPassword);
	const updated = await tx
		.update(account)
		.set({ password: passwordHash })
		.where(
			and(eq(account.userId, userId), eq(account.providerId, "credential")),
		)
		.returning({ id: account.id });
	if (updated.length !== 1) throw new Error("INVALID_CREDENTIAL_ACCOUNT");
	await tx
		.update(userProfiles)
		.set({
			isActive: true,
			mustChangePassword: true,
			passwordResetRequired: forceRotation,
		})
		.where(and(eq(userProfiles.userId, userId), eq(userProfiles.actor, "DT")));
	if (forceRotation) {
		await tx.delete(session).where(eq(session.userId, userId));
	}
	return { temporaryPassword };
}

export async function revokeUserSessions(
	tx: DatabaseTransaction,
	userId: string,
) {
	await tx.delete(session).where(eq(session.userId, userId));
}

export async function listAllDtAccountProfiles(
	db: Database | DatabaseTransaction,
) {
	return db
		.select({
			userId: user.id,
			updatedAt: userProfiles.updatedAt,
			nim: user.username,
			name: user.name,
			email: user.email,
			isActive: userProfiles.isActive,
			mustChangePassword: userProfiles.mustChangePassword,
		})
		.from(user)
		.innerJoin(userProfiles, eq(userProfiles.userId, user.id))
		.where(eq(userProfiles.actor, "DT"))
		.orderBy(asc(user.username), asc(user.id));
}

export async function maintainDtUserAccountTx(
	tx: DatabaseTransaction,
	actorUserId: string,
	input:
		| {
				kind: "edit";
				userId: string;
				name: string;
				email: string;
				isActive: boolean;
				expectedUpdatedAt: string;
		  }
		| {
				kind: "archive";
				userId: string;
				expectedUpdatedAt: string;
		  },
) {
	const [target] = await tx
		.select()
		.from(userProfiles)
		.where(
			and(eq(userProfiles.userId, input.userId), eq(userProfiles.actor, "DT")),
		)
		.for("update");
	if (!target) {
		throw new TRPCError({ code: "NOT_FOUND", message: "DT_ACCOUNT_NOT_FOUND" });
	}
	if (target.updatedAt.toISOString() !== input.expectedUpdatedAt) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Data akun DT sudah berubah. Perbarui data sebelum mencoba lagi.",
		});
	}
	const [before] = await tx
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, input.userId));
	if (!before) {
		throw new TRPCError({ code: "NOT_FOUND", message: "DT_ACCOUNT_NOT_FOUND" });
	}
	if (input.kind === "edit") {
		const normalizedEmail = input.email.trim().toLowerCase();
		const [duplicate] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(sql`lower(${user.email})`, normalizedEmail));
		if (duplicate && duplicate.id !== input.userId) {
			throw new TRPCError({ code: "CONFLICT", message: "EMAIL_EXISTS" });
		}
		await tx
			.update(user)
			.set({
				name: input.name,
				email: normalizedEmail,
				...(normalizedEmail !== before.email ? { emailVerified: false } : {}),
			})
			.where(eq(user.id, input.userId));
	}
	await tx
		.update(userProfiles)
		.set({
			isActive: input.kind === "edit" ? input.isActive : false,
			updatedAt: sql`greatest(clock_timestamp(), ${userProfiles.updatedAt} + interval '1 millisecond')`,
		})
		.where(eq(userProfiles.userId, input.userId));
	await tx.delete(session).where(eq(session.userId, input.userId));
	await tx.insert(accountAuditLogs).values({
		actorUserId,
		targetUserId: input.userId,
		action: input.kind === "archive" ? "ACCOUNT_ARCHIVED" : "ACCOUNT_UPDATED",
		details: {
			actorType: "DT",
			before: { ...before, isActive: target.isActive },
			after:
				input.kind === "edit"
					? {
							name: input.name,
							email: input.email.trim().toLowerCase(),
							isActive: input.isActive,
						}
					: { isActive: false },
		},
	});
	return { userId: input.userId };
}

export async function resetDtUserAccountPasswordTx(
	tx: DatabaseTransaction,
	actorUserId: string,
	authConfig: AuthConfig,
	targetUserId: string,
) {
	const [target] = await tx
		.select({ userId: userProfiles.userId, isActive: userProfiles.isActive })
		.from(userProfiles)
		.where(
			and(eq(userProfiles.userId, targetUserId), eq(userProfiles.actor, "DT")),
		)
		.for("update");
	if (!target) {
		throw new TRPCError({ code: "NOT_FOUND", message: "DT_ACCOUNT_NOT_FOUND" });
	}
	const { temporaryPassword } = await issueDtTemporaryPassword(
		tx,
		authConfig,
		targetUserId,
		true,
	);
	if (!target.isActive) {
		await tx
			.update(userProfiles)
			.set({ isActive: false })
			.where(eq(userProfiles.userId, targetUserId));
	}
	await tx.insert(accountAuditLogs).values({
		actorUserId,
		targetUserId,
		action: "PASSWORD_RESET",
		details: { actorType: "DT" },
	});
	return { temporaryPassword };
}

export type {
	ActiveDtIdentity,
	ActiveIdentity,
	ActiveSrIdentity,
} from "@resora/auth/sr-access";
