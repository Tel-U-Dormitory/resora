import { expect, test } from "bun:test";
import type { Database } from "@resora/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Context } from "../../context";
import { identityRouter } from "./identity.router";

function fixture(overrides: Record<string, unknown> = {}) {
	const identity = {
		userId: "own-user",
		actor: "SR",
		tenureStatus: "ACTIVE",
		isActive: true,
		mustChangePassword: false,
		departmentCode: "HCO",
		positionCode: "KADEP",
		buildingId: "synthetic-building",
		nim: "0000000001",
		...overrides,
	};
	const profile = {
		name: "Synthetic SR",
		email: "synthetic@example.invalid",
		department: "HCO",
		position: "Kadep",
		building: "Gedung A",
	};
	const conditions: unknown[][] = [];
	const selections: string[][] = [];
	const db = {
		select(fields: Record<string, unknown>) {
			selections.push(Object.keys(fields));
			const query = {
				from: () => query,
				innerJoin: () => query,
				leftJoin: () => query,
				where(condition: Parameters<PgDialect["sqlToQuery"]>[0]) {
					conditions.push(new PgDialect().sqlToQuery(condition).params);
					return Promise.resolve(
						selections.length === 1 ? [identity] : [profile],
					);
				},
			};
			return query;
		},
	} as unknown as Database;
	const ctx = { db, session: { user: { id: "own-user" } } } as Context;
	return {
		caller: identityRouter.createCaller(ctx),
		ctx,
		conditions,
		selections,
		profile,
	};
}

test("profile derives identity from session, keeps leading zeros and projects safe organization labels", async () => {
	const f = fixture();
	const result = await Reflect.apply(f.caller.profile, null, [
		{ userId: "forged-user", department: "INTI" },
	]);
	expect(result).toEqual({
		...f.profile,
		actor: "SR",
		nim: "0000000001",
		isActive: true,
	});
	expect(f.conditions).toEqual([["own-user"], ["own-user"]]);
	expect(f.selections[1]).toEqual([
		"name",
		"email",
		"department",
		"position",
		"building",
	]);
	for (const key of ["password", "session", "isSuperadmin", "buildingId"])
		expect(result).not.toHaveProperty(key);
});

test("anonymous profile request is rejected before data access", async () => {
	const f = fixture();
	const caller = identityRouter.createCaller({ ...f.ctx, session: null });
	try {
		await caller.profile();
		throw new Error("Unexpected success");
	} catch (error) {
		expect(error).toMatchObject({ code: "UNAUTHORIZED" });
	}
	expect(f.selections).toHaveLength(0);
});

for (const [label, identity, code] of [
	["inactive", { isActive: false }, "UNAUTHORIZED"],
	["non-SR", { actor: "MAHASISWA" }, "UNAUTHORIZED"],
	["missing NIM", { nim: null }, "UNAUTHORIZED"],
	[
		"SUPERADMIN mandatory password change",
		{ mustChangePassword: true, isSuperadmin: true },
		"FORBIDDEN",
	],
] as const)
	test(`${label} cannot read profile`, async () => {
		const f = fixture(identity);
		try {
			await f.caller.profile();
			throw new Error("Unexpected success");
		} catch (error) {
			expect(error).toMatchObject({ code });
		}
		expect(f.selections).toHaveLength(1);
	});

test("regular SR keeps its stored flag but can read profile and normal session permissions", async () => {
	const f = fixture({ mustChangePassword: true, isSuperadmin: false });
	expect(await f.caller.profile()).toMatchObject({ nim: "0000000001" });
	const session = fixture({ mustChangePassword: true, isSuperadmin: false });
	expect(await session.caller.session()).toMatchObject({
		mustChangePassword: true,
		requiresPasswordChange: false,
		canManageInternalEvents: true,
		canManageBroadcast: true,
		canManageInternalAttendanceManually: true,
		isSuperadmin: false,
	});
});

test("privileged session reports the required gate even before admin permissions are available", async () => {
	for (const actor of ["SR", "SYSTEM_ADMIN"]) {
		const f = fixture({ actor, mustChangePassword: true, isSuperadmin: true });
		expect(await f.caller.session()).toMatchObject({
			mustChangePassword: true,
			requiresPasswordChange: true,
			canManageInternalEvents: false,
			canManageBroadcast: false,
			canManageInternalAttendanceManually: false,
			isSuperadmin: false,
		});
	}
});

test("session permissions reflect DB SUPERADMIN grant/revocation without changing assignment", async () => {
	for (const isSuperadmin of [true, false]) {
		const f = fixture({
			departmentCode: "INTI",
			positionCode: "KETUM",
			isSuperadmin,
		});
		expect(await f.caller.session()).toMatchObject({
			isSuperadmin,
			canManageInternalEvents: isSuperadmin,
			canManageInternalAttendanceManually: isSuperadmin,
			canOperateGeneralActivity: isSuperadmin,
		});
	}
});

for (const [departmentCode, positionCode, allowed] of [
	["HCO", "ANGGOTA", true],
	["HCO", "SEKDEP", true],
	["HCO", "KADEP", true],
	["HCO", "KETUM", false],
	["RND", "KADEP", false],
	["INTI", "KETUM", false],
] as const)
	test(`session navigation capability uses existing policy for ${departmentCode}/${positionCode}`, async () => {
		const f = fixture({ departmentCode, positionCode });
		const session = await f.caller.session();
		expect(session?.canManageInternalEvents).toBe(allowed);
		expect(session?.canManageCommittee).toBe(allowed);
	});

test("session broadcast capability comes from structural authority or explicit privilege, never committee roles", async () => {
	for (const [departmentCode, positionCode, allowed] of [
		["INTI", "KETUM", true],
		["INTI", "WAKETUM", true],
		["INTI", "SEKRETARIS", true],
		["INTI", "BENDAHARA", true],
		["HCO", "KADEP", true],
		["ADAPTIF", "KADEP", true],
		["SOSIAL", "KADEP", true],
		["AKADEMIK", "KADEP", true],
		["SPIRITUAL", "KADEP", true],
		["MEDIA", "KADEP", true],
		["RND", "KADEP", true],
		["HCO", "SEKDEP", false],
		["HCO", "ANGGOTA", false],
		["HCO", "KETUM", false],
	] as const) {
		const f = fixture({
			departmentCode,
			positionCode,
			isSuperadmin: false,
			committeePositionCode: "KADEP",
		});
		expect((await f.caller.session())?.canManageBroadcast).toBe(allowed);
	}
	for (const actor of ["SYSTEM_ADMIN", "SR"]) {
		expect(
			(
				await fixture({
					actor,
					isSuperadmin: true,
					positionCode: "ANGGOTA",
				}).caller.session()
			)?.canManageBroadcast,
		).toBe(true);
		expect(
			(
				await fixture({
					actor,
					isSuperadmin: true,
					passwordResetRequired: true,
				}).caller.session()
			)?.canManageBroadcast,
		).toBe(false);
	}
	for (const tenureStatus of ["EXPIRED", "SCHEDULED", "UNASSIGNED"])
		expect(await fixture({ tenureStatus }).caller.session()).toBeNull();
	expect(await fixture({ isActive: false }).caller.session()).toBeNull();
});
