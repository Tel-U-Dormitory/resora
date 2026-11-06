import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repositorySources, violations } from "./src/architecture";

const modulePath = (name: string, file: string) =>
	`packages/api/src/modules/${name}/${file}.ts`;
test("public contracts pass; private relative/alias imports, dynamic imports and cycles fail", () => {
	const a = modulePath("broadcast", "broadcast.service");
	const b = modulePath("identity", "identity.public");
	expect(
		violations(
			new Map([
				[a, 'import { x } from "../identity/identity.public";'],
				[b, "export const x = 1;"],
			]),
		),
	).toEqual([]);
	for (const source of [
		'import "../identity/identity-policy";',
		'import "@resora/api/modules/identity/identity-policy";',
		'import("../identity/identity-policy");',
	]) {
		expect(
			violations(
				new Map([
					[a, source],
					[modulePath("identity", "identity-policy"), ""],
				]),
			).join(),
		).toContain("private module import");
	}
	expect(
		violations(
			new Map([
				[a, 'import "../identity/identity.public";'],
				[b, 'import "../broadcast/broadcast.public";'],
				[modulePath("broadcast", "broadcast.public"), ""],
			]),
		).join(),
	).toContain("cycle:");
});
test("foreign tables, application SQL imports and transitive browser/server leaks fail", () => {
	const table = "packages/db/src/schema/identity.ts";
	expect(
		violations(
			new Map([
				[
					modulePath("broadcast", "broadcast.service"),
					'import { userProfiles } from "@resora/db/schema/identity";',
				],
				[table, ""],
			]),
		).join(),
	).toContain("foreign table access");
	expect(
		violations(
			new Map([
				[
					"packages/api/src/application/workflow.ts",
					'import "@resora/db/schema/identity";',
				],
				[table, ""],
			]),
		).join(),
	).toContain("application persistence access");
	expect(
		violations(
			new Map([
				[
					"apps/web/src/features/broadcast/view.tsx",
					'"use client"; import "./helper";',
				],
				["apps/web/src/features/broadcast/helper.ts", 'import "node:crypto";'],
			]),
		).join(),
	).toContain("server dependency in browser");
});
test("type-only references are safe and frontend feature boundaries reject private access", () => {
	expect(
		violations(
			new Map([
				[
					"apps/web/src/features/broadcast/view.tsx",
					'"use client"; import type { X } from "node:crypto";',
				],
			]),
		),
	).toEqual([]);
	expect(
		violations(
			new Map([
				[
					"apps/web/src/features/broadcast/view.tsx",
					'import "../identity/auth/login-form";',
				],
				["apps/web/src/features/identity/auth/login-form.tsx", ""],
			]),
		).join(),
	).toContain("private feature import");
});

test("raw SQL, relational queries, external private consumers and client/server entries are guarded", () => {
	for (const code of [
		"db.execute(sql`select * from events`)",
		"db.query.events.findMany()",
	]) {
		expect(
			violations(new Map([[modulePath("broadcast", "service"), code]])).join(),
		).toContain("foreign SQL table access");
	}
	expect(
		violations(
			new Map([
				[
					"apps/server/src/job.ts",
					'import "@resora/api/modules/broadcast/broadcast.service";',
				],
				[modulePath("broadcast", "broadcast.service"), ""],
			]),
		).join(),
	).toContain("private module import");
	expect(
		violations(
			new Map([
				[
					"apps/web/src/features/identity/view.tsx",
					'"use client"; import "./server";',
				],
				["apps/web/src/features/identity/server.ts", ""],
			]),
		).join(),
	).toContain("server dependency in browser");
});

test("the repository has no production boundary exceptions", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	expect(violations(repositorySources(root))).toEqual([]);
});

test("root verification scripts reference existing files after module moves", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const manifest = JSON.parse(
		readFileSync(resolve(root, "package.json"), "utf8"),
	);
	for (const command of Object.values(manifest.scripts) as string[]) {
		for (const match of command.matchAll(
			/\b(?:apps|packages|scripts|tests)\/[^\s]+\.(?:tsx?|mjs)\b/g,
		)) {
			expect(existsSync(resolve(root, match[0]))).toBe(true);
		}
	}
});

test("test fixtures may cross owners but production cannot import test code", () => {
	const fixture =
		"packages/api/src/application/internal-events/tests/fixtures/event-workflow.ts";
	const sources = new Map([
		[fixture, 'import "@resora/db/schema/attendance";'],
		["packages/db/src/schema/attendance.ts", ""],
	]);
	expect(violations(sources)).toEqual([]);
	for (const specifier of [
		"../tests/fixtures/event-workflow",
		"../tests/sample.test",
	]) {
		const target = specifier.endsWith(".test")
			? "packages/api/src/application/internal-events/tests/sample.test.ts"
			: fixture;
		const check = new Map([
			...sources,
			[target, ""],
			[
				"packages/api/src/application/internal-events/live/run.ts",
				`import "${specifier}";`,
			],
		]);
		expect(violations(check).join()).toContain(
			"production import of test support",
		);
	}
});
