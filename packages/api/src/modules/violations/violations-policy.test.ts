import { expect, test } from "bun:test";
import type { ActiveIdentity, ActiveSrIdentity } from "@resora/auth/sr-access";
import {
	canCreateViolation,
	canMutateViolation,
	canReadViolations,
	canSelectViolationBuilding,
} from "./violations-policy";

const sr: ActiveSrIdentity = {
	userId: "synthetic-reporter",
	actor: "SR",
	nim: "0000000001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode: "RND",
	positionCode: "ANGGOTA",
	buildingId: "synthetic-building-a",
};

const superadmin: ActiveIdentity = {
	userId: "synthetic-admin",
	actor: "SYSTEM_ADMIN",
	username: "synthetic.admin",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: true,
};

test("active SR across buildings and privileged SUPERADMIN can read reports", () => {
	expect(canReadViolations(sr)).toBe(true);
	expect(canReadViolations(superadmin)).toBe(true);
	expect(canReadViolations({ ...sr, buildingId: "synthetic-building-b" })).toBe(
		true,
	);
});

test("inactive, password-gated, and non-privileged admin identities cannot read", () => {
	for (const identity of [
		null,
		undefined,
		{ ...sr, isActive: false },
		{ ...sr, passwordResetRequired: true },
		{ ...superadmin, isSuperadmin: false },
		{ ...superadmin, mustChangePassword: true },
	])
		expect(canReadViolations(identity as ActiveIdentity | null)).toBe(false);
});

test("only the SR reporter or privileged SUPERADMIN can mutate a report", () => {
	expect(canMutateViolation(sr, sr.userId)).toBe(true);
	expect(
		canMutateViolation({ ...sr, userId: "synthetic-other-sr" }, sr.userId),
	).toBe(false);
	expect(canMutateViolation(superadmin, sr.userId)).toBe(true);
	expect(canMutateViolation(null, sr.userId)).toBe(false);
});

test("privileged administrator can create and select a building", () => {
	expect(canCreateViolation(superadmin)).toBe(true);
	expect(canSelectViolationBuilding(superadmin)).toBe(true);
	expect(canCreateViolation({ ...superadmin, isActive: false })).toBe(false);
	expect(
		canSelectViolationBuilding({ ...superadmin, mustChangePassword: true }),
	).toBe(false);
});
