import { expect, test } from "bun:test";
import type { Database } from "@resora/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Context } from "../../context";
import { identityRouter } from "./identity.router";

function fixture(overrides: Record<string, unknown> = {}) {
	const identity = {
		userId: "own-user",
		actor: "SR",
		isActive: true,
		mustChangePassword: false,
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
	expect(result).toEqual({ ...f.profile, nim: "0000000001", isActive: true });
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
	["mandatory password change", { mustChangePassword: true }, "FORBIDDEN"],
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
