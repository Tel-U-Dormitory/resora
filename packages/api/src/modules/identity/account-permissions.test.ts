import { expect, test } from "bun:test";
import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { setAccountPermissionSchema } from "./account-permissions";
import { canManageManualAttendance } from "./identity.public";
import {
	canManageBroadcast,
	canManageCommittee,
	canManageInternalEvent,
	hasSuperadminPrivilege,
} from "./identity-policy";
import { manualPermissionState, permissionCatalog } from "./permission-catalog";

const identity: ActiveSrIdentity = {
	userId: "synthetic",
	actor: "SR",
	nim: "00001",
	isActive: true,
	mustChangePassword: false,
	departmentCode: "HCO",
	positionCode: "ANGGOTA",
	buildingId: "building",
	isSuperadmin: false,
};
test("single typed Absensi catalog and strict management inputs reject arbitrary privileges/ownership", () => {
	expect(permissionCatalog).toHaveLength(1);
	expect(permissionCatalog[0]).toMatchObject({
		code: "ATTENDANCE_MANUAL_MANAGE",
		category: "ABSENSI",
		categoryLabel: "Absensi",
		eligibleDepartment: "HCO",
	});
	for (const permissionCode of ["SUPERADMIN", "ABSENSI", "UNKNOWN"])
		expect(
			setAccountPermissionSchema.safeParse({
				userId: "synthetic",
				permissionCode,
				enabled: true,
			}).success,
		).toBe(false);
	expect(
		setAccountPermissionSchema.safeParse({
			userId: "synthetic",
			permissionCode: "ATTENDANCE_MANUAL_MANAGE",
			enabled: true,
			grantedByUserId: "forged",
		}).success,
	).toBe(false);
});
test("intrinsic/explicit/effective permissions retain structural role isolation and password gates", () => {
	for (const positionCode of ["KADEP", "SEKDEP", "ANGGOTA"]) {
		const sr = { ...identity, positionCode };
		expect(manualPermissionState(sr, false).effective).toBe(
			positionCode === "KADEP",
		);
		expect(manualPermissionState(sr, true).effective).toBe(true);
		expect(manualPermissionState(sr, true).eligibleForGrant).toBe(
			positionCode !== "KADEP",
		);
		expect(canManageInternalEvent(sr)).toBe(true);
	}
	for (const sr of [
		{ ...identity, departmentCode: "RND" },
		{ ...identity, isActive: false },
		{ ...identity, positionCode: "KETUM" },
		{ ...identity, passwordResetRequired: true as const },
		{ ...identity, isSuperadmin: true, mustChangePassword: true },
	])
		expect(manualPermissionState(sr, true).effective).toBe(false);
	const sr = { ...identity, committeePositionCode: "KADEP" };
	expect(hasSuperadminPrivilege(sr)).toBe(false);
	expect(canManageCommittee(sr)).toBe(false);
	expect(canManageBroadcast(sr)).toBe(false);
	expect(manualPermissionState(sr, false).effective).toBe(false);
	expect(
		manualPermissionState({ ...identity, isSuperadmin: true }, false).intrinsic,
	).toBe(true);
});
test("grant lookup fails closed on database failure; non-HCO and intrinsic access avoid grant queries", async () => {
	const db = {
		select: () => {
			throw new Error("synthetic database unavailable");
		},
	} as unknown as Database;
	await expect(canManageManualAttendance(db, identity)).rejects.toThrow(
		"synthetic database unavailable",
	);
	expect(
		await canManageManualAttendance(db, { ...identity, departmentCode: "RND" }),
	).toBe(false);
	expect(
		await canManageManualAttendance(db, { ...identity, positionCode: "KADEP" }),
	).toBe(true);
});
