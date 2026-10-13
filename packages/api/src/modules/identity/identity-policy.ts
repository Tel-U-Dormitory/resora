import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import { isValidSrAssignment } from "@resora/db/organization";

// Use only server-derived ctx.identity after protectedProcedure validates the session.
// Resource state/invitation/reason/audit checks remain in their owning domain.
type Identity = ActiveSrIdentity | null | undefined;

export function canAccessPersonalSr(identity: Identity) {
	return (
		identity?.actor === "SR" &&
		identity.isActive === true &&
		identity.mustChangePassword === false
	);
}

// Shared operational gate; SUPERADMIN overrides department/position, never eligibility.
export function canManageInternalEvent(identity: Identity) {
	return (
		canAccessPersonalSr(identity) &&
		identity != null &&
		isValidSrAssignment(identity.departmentCode, identity.positionCode) &&
		(identity.departmentCode === "HCO" || hasSuperadminPrivilege(identity))
	);
}

export function canManageInternalAttendanceManually(identity: Identity) {
	return (
		canManageInternalEvent(identity) &&
		(identity?.positionCode === "KADEP" || hasSuperadminPrivilege(identity))
	);
}

// Includes general-activity manual attendance: no KADEP requirement.
export function canOperateGeneralActivity(identity: Identity) {
	return (
		canAccessPersonalSr(identity) &&
		(identity?.departmentCode === "ADAPTIF" || hasSuperadminPrivilege(identity))
	);
}

export function hasSuperadminPrivilege(identity: Identity) {
	return canAccessPersonalSr(identity) && identity?.isSuperadmin === true;
}
