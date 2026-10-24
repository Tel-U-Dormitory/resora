import {
	type ActiveIdentity,
	type ActiveSrIdentity,
	requiresPasswordChange,
} from "@resora/auth/sr-access";
import { isValidSrAssignment } from "@resora/db/organization";

// Use only server-derived ctx.identity after protectedProcedure validates the session.
// Resource state/invitation/reason/audit checks remain in their owning domain.
type Identity = ActiveIdentity | null | undefined;

export function canAccessPersonalSr(
	identity: Identity,
): identity is ActiveSrIdentity {
	return (
		identity?.actor === "SR" &&
		identity.isActive === true &&
		!requiresPasswordChange(identity)
	);
}

// Shared operational gate; SUPERADMIN overrides department/position, never eligibility.
export function canManageInternalEvent(identity: Identity) {
	return (
		hasSuperadminPrivilege(identity) ||
		(canAccessPersonalSr(identity) &&
			identity != null &&
			isValidSrAssignment(identity.departmentCode, identity.positionCode) &&
			identity.departmentCode === "HCO")
	);
}

export function canManageInternalAttendanceManually(identity: Identity) {
	return (
		canManageInternalEvent(identity) &&
		(hasSuperadminPrivilege(identity) ||
			(identity?.actor === "SR" && identity.positionCode === "KADEP"))
	);
}

export function canManageCommittee(identity: Identity) {
	return (
		identity != null &&
		!requiresPasswordChange(identity) &&
		(hasSuperadminPrivilege(identity) ||
			(canAccessPersonalSr(identity) &&
				isValidSrAssignment(identity.departmentCode, identity.positionCode) &&
				identity.departmentCode === "HCO" &&
				identity.positionCode === "KADEP"))
	);
}

// Includes general-activity manual attendance: no KADEP requirement.
export function canOperateGeneralActivity(identity: Identity) {
	return (
		hasSuperadminPrivilege(identity) ||
		(canAccessPersonalSr(identity) && identity.departmentCode === "ADAPTIF")
	);
}

export function hasSuperadminPrivilege(identity: Identity) {
	return (
		identity?.isActive === true &&
		identity.mustChangePassword === false &&
		identity?.isSuperadmin === true &&
		(identity.actor === "SYSTEM_ADMIN" ||
			(identity.actor === "SR" &&
				isValidSrAssignment(identity.departmentCode, identity.positionCode)))
	);
}
