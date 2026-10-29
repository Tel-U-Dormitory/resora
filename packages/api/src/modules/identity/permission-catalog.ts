import type { ActiveIdentity } from "@resora/auth/sr-access";
import {
	canManageInternalAttendanceManually,
	canManageInternalEvent,
} from "./identity-policy";

export const permissionCodes = ["ATTENDANCE_MANUAL_MANAGE"] as const;
export type PermissionCode = (typeof permissionCodes)[number];
export const permissionCatalog = [
	{
		code: permissionCodes[0],
		category: "HCO",
		categoryLabel: "HCO",
		label: "Input & Koreksi Absensi Manual",
		description:
			"Mengizinkan input dan koreksi kehadiran manual serta akses audit terkait.",
		eligibleDepartment: "HCO",
	},
] as const;

export function applicablePermissions(
	departmentCode: string | null | undefined,
) {
	return permissionCatalog.filter(
		(permission) => permission.eligibleDepartment === departmentCode,
	);
}

export function eligibleForManualGrant(
	identity: ActiveIdentity | null | undefined,
) {
	return (
		identity?.actor === "SR" &&
		identity.departmentCode === "HCO" &&
		canManageInternalEvent(identity)
	);
}

export function needsManualGrant(identity: ActiveIdentity | null | undefined) {
	return (
		eligibleForManualGrant(identity) &&
		!canManageInternalAttendanceManually(identity)
	);
}

export function manualPermissionState(
	identity: ActiveIdentity | null | undefined,
	explicit: boolean,
) {
	const intrinsic = canManageInternalAttendanceManually(identity);
	return {
		intrinsic,
		explicit,
		effective: intrinsic || (explicit && eligibleForManualGrant(identity)),
		eligibleForGrant: needsManualGrant(identity),
	};
}
