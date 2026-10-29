import { expect, test } from "bun:test";
import {
	type ActiveIdentity,
	type ActiveSrIdentity,
	getActiveIdentity,
} from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	canAccessPersonalSr,
	canManageCommittee,
	canManageInternalAttendanceManually,
	canManageInternalEvent,
	canOperateGeneralActivity,
	hasSuperadminPrivilege,
} from "./identity-policy";

test("regular SR initial-password flag preserves department permissions", () => {
	for (const [department, position, internal, manual, general] of [
		["HCO", "ANGGOTA", true, false, false],
		["HCO", "KADEP", true, true, false],
		["INTI", "KETUM", false, false, false],
		["ADAPTIF", "ANGGOTA", false, false, true],
	] as const) {
		const current = {
			...identity(department, position),
			mustChangePassword: true,
		};
		expect(canAccessPersonalSr(current)).toBe(true);
		expect(canManageInternalEvent(current)).toBe(internal);
		expect(canManageInternalAttendanceManually(current)).toBe(manual);
		expect(canOperateGeneralActivity(current)).toBe(general);
		expect(hasSuperadminPrivilege(current)).toBe(false);
	}
});

test("independent committee policy allows all eligible structural HCO and valid SUPERADMIN", () => {
	expect(canManageCommittee).not.toBe(canManageInternalEvent);
	for (const [department, position, allowed] of [
		["HCO", "KADEP", true],
		["HCO", "SEKDEP", true],
		["HCO", "ANGGOTA", true],
		["RND", "KADEP", false],
		["ADAPTIF", "KADEP", false],
		["INTI", "KETUM", false],
		["HCO", "KETUM", false],
	] as const) {
		expect(canManageCommittee(identity(department, position))).toBe(allowed);
	}
	for (const [department, position] of [
		["RND", "ANGGOTA"],
		["INTI", "KETUM"],
	] as const)
		expect(canManageCommittee(identity(department, position, true))).toBe(true);
	const admin: ActiveIdentity = {
		userId: "synthetic-system",
		actor: "SYSTEM_ADMIN",
		username: "resora.admin",
		isActive: true,
		mustChangePassword: false,
		isSuperadmin: true,
	};
	expect(canManageCommittee(admin)).toBe(true);
	for (const invalid of [
		null,
		undefined,
		{ ...admin, isSuperadmin: false },
		{ ...admin, mustChangePassword: true },
		{ ...admin, isActive: false },
		{ ...admin, passwordResetRequired: true },
		{ ...identity("HCO", "KADEP"), isActive: false },
		{ ...identity("HCO", "KADEP"), passwordResetRequired: true },
		{ ...identity("HCO", "SEKDEP"), passwordResetRequired: true },
		{ ...identity("HCO", "ANGGOTA"), isActive: false },
		identity("HCO", "KETUM", true),
		{ ...identity("RND", "ANGGOTA"), committeePositionCode: "KADEP" },
		{ ...identity("RND", "ANGGOTA"), committeePositionCode: "PJ" },
		{ ...identity("RND", "ANGGOTA"), committeePositionCode: "PIC1" },
		{ ...identity("RND", "ANGGOTA"), committeePositionCode: "PIC2" },
	])
		expect(
			canManageCommittee(invalid as ActiveIdentity | null | undefined),
		).toBe(false);
	// Ordinary SR's initial-password flag remains optional; privileged rotation does not.
	expect(
		canManageCommittee({
			...identity("HCO", "KADEP"),
			mustChangePassword: true,
		}),
	).toBe(true);
	expect(
		canManageCommittee({
			...identity("HCO", "KADEP", true),
			mustChangePassword: true,
		}),
	).toBe(false);
});

test("committee policy consumes live tenure-verified identities rather than membership roles", async () => {
	for (const position of ["KADEP", "SEKDEP", "ANGGOTA"])
		for (const status of ["ACTIVE", "EXPIRED", "SCHEDULED", "UNASSIGNED"]) {
			const row = {
				...identity("HCO", position),
				tenureStatus: status,
				srUserId: "synthetic-policy",
			};
			const query = {
				innerJoin: () => query,
				leftJoin: () => query,
				where: async () => [row],
			};
			const db = {
				select: () => ({ from: () => query }),
			} as unknown as Database;
			expect(canManageCommittee(await getActiveIdentity(db, row.userId))).toBe(
				status === "ACTIVE",
			);
		}
});

const identity = (
	departmentCode: string,
	positionCode: string,
	isSuperadmin = false,
): ActiveSrIdentity => ({
	userId: "synthetic-policy",
	nim: "000012345",
	actor: "SR",
	isActive: true,
	departmentCode,
	positionCode,
	buildingId: "synthetic-building",
	mustChangePassword: false,
	isSuperadmin,
});
for (const [department, position, internal, manual, general] of [
	["HCO", "ANGGOTA", true, false, false],
	["HCO", "SEKDEP", true, false, false],
	["HCO", "KADEP", true, true, false],
	["ADAPTIF", "KADEP", false, false, true],
	["ADAPTIF", "ANGGOTA", false, false, true],
	["SOSIAL", "ANGGOTA", false, false, false],
	["RND", "KADEP", false, false, false],
	["HCO", "KADIV", false, false, false], // Legacy assignment is not an operator.
	["HCO", "KETUM", false, false, false],
	["HCO", "WAKETUM", false, false, false],
	["HCO", "SEKRETARIS", false, false, false],
	["HCO", "BENDAHARA", false, false, false],
	["INTI", "KETUM", false, false, false],
] as const) {
	test(`${department} + ${position}: explicit operational boundaries`, () => {
		const current = identity(department, position);
		expect(canAccessPersonalSr(current)).toBe(true);
		expect(canManageInternalEvent(current)).toBe(internal);
		expect(canManageInternalAttendanceManually(current)).toBe(manual);
		expect(canOperateGeneralActivity(current)).toBe(general);
		expect(hasSuperadminPrivilege(current)).toBe(false);
	});
}
for (const [department, position] of [
	["RND", "ANGGOTA"],
	["SOSIAL", "KADEP"],
	["INTI", "KETUM"],
	["HCO", "ANGGOTA"],
] as const)
	test(`explicit SUPERADMIN ${department}/${position} overrides operational department/position gates`, () => {
		const current = identity(department, position, true);
		expect(hasSuperadminPrivilege(current)).toBe(true);
		expect(canManageInternalEvent(current)).toBe(true);
		expect(canManageInternalAttendanceManually(current)).toBe(true);
		expect(canOperateGeneralActivity(current)).toBe(true);
		expect(current).toMatchObject({
			departmentCode: department,
			positionCode: position,
		});
	});
test("invalid HCO/KETUM assignment denies every SUPERADMIN permission", () => {
	const current = identity("HCO", "KETUM", true);
	expect(hasSuperadminPrivilege(current)).toBe(false);
	expect(canManageInternalEvent(current)).toBe(false);
	expect(canManageInternalAttendanceManually(current)).toBe(false);
	expect(canOperateGeneralActivity(current)).toBe(false);
});

test("dedicated SYSTEM_ADMIN grants operations without SR assignment or participant permissions", () => {
	const admin: ActiveIdentity = {
		userId: "synthetic-system",
		actor: "SYSTEM_ADMIN",
		username: "resora.admin",
		isActive: true,
		mustChangePassword: false,
		isSuperadmin: true,
	};
	for (const policy of [
		hasSuperadminPrivilege,
		canManageInternalEvent,
		canManageInternalAttendanceManually,
		canOperateGeneralActivity,
	])
		expect(policy(admin)).toBe(true);
	expect(canAccessPersonalSr(admin)).toBe(false);
	for (const invalid of [
		{ ...admin, isActive: false },
		{ ...admin, mustChangePassword: true },
		{ ...admin, isSuperadmin: false },
		{ ...admin, actor: "MAHASISWA" },
	])
		for (const policy of [
			hasSuperadminPrivilege,
			canManageInternalEvent,
			canManageInternalAttendanceManually,
			canOperateGeneralActivity,
		])
			expect(policy(invalid as ActiveIdentity)).toBe(false);
});
test("missing identity, inactive/non-SR identity and first-change gate deny every action", () => {
	const base = identity("HCO", "KADEP", true);
	for (const invalid of [
		null,
		undefined,
		{ ...base, isActive: false },
		{ ...base, actor: "MAHASISWA" },
		{ ...base, mustChangePassword: true },
	]) {
		for (const policy of [
			canAccessPersonalSr,
			canManageInternalEvent,
			canManageInternalAttendanceManually,
			canOperateGeneralActivity,
			hasSuperadminPrivilege,
		])
			expect(policy(invalid as ActiveSrIdentity | null | undefined)).toBe(
				false,
			);
	}
});
