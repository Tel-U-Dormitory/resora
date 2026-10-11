import type { ActiveSrIdentity } from "@resora/auth/sr-access";

// Use only server-derived ctx.identity after protectedProcedure validates the session.
// Resource ownership/state/invitation/reason/audit checks belong to future real use cases.
type Identity = ActiveSrIdentity | null | undefined;

export function canAccessPersonalSr(identity: Identity) {
	return (
		identity?.actor === "SR" &&
		identity.isActive === true &&
		identity.mustChangePassword === false
	);
}

// Shared department gate for internal events, roster, QR/session and recap/export.
export function canManageInternalEvent(identity: Identity) {
	return canAccessPersonalSr(identity) && identity?.departmentCode === "HCO";
}

export function canManageInternalAttendanceManually(identity: Identity) {
	return canManageInternalEvent(identity) && identity?.positionCode === "KADEP";
}

// Includes general-activity manual attendance: no KADEP requirement.
export function canOperateGeneralActivity(identity: Identity) {
	return (
		canAccessPersonalSr(identity) && identity?.departmentCode === "ADAPTIF"
	);
}

export function hasSuperadminPrivilege(identity: Identity) {
	return canAccessPersonalSr(identity) && identity?.isSuperadmin === true;
}
