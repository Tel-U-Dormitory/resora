import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(
	new URL("../../scripts/test-offline.ts", import.meta.url),
	"utf8",
)
	.replace(/^import .*;\r?$/gm, "")
	.replace("import.meta.url", '"file:///synthetic/scripts/test-offline.ts"');

function run(listing: object, child: object = { status: 0 }) {
	const calls: { command: string; args: string[]; options: object }[] = [];
	const exit = new Error("SYNTHETIC_EXIT");
	let status: number | undefined;
	try {
		runInNewContext(source, {
			URL,
			fileURLToPath: () => "/synthetic/",
			console: { info() {}, error() {} },
			spawnSync: (command: string, args: string[], options: object) => {
				calls.push({ command, args, options });
				return calls.length === 1 ? listing : child;
			},
			process: {
				execPath: "/synthetic/bun",
				exit: (code: number) => {
					status = code;
					throw exit;
				},
			},
		});
	} catch (error) {
		if (error !== exit) throw error;
	}
	return { calls, status };
}

test("offline discovery sorts unique app/package tests and excludes integration/generated/scratch paths", () => {
	const paths = [
		"packages/ui/src/z.test.tsx",
		"apps/server/src/a.test.ts",
		"packages/ui/src/z.test.tsx",
		"packages/api/src/db.integration.test.ts",
		"packages/ui/src/db.integration.test.tsx",
		...[
			"node_modules",
			"dist",
			"build",
			"coverage",
			"tmp",
			"temp",
			".next",
			".turbo",
			"generated",
			"_generated",
			"__generated__",
		].map((dir) => `packages/api/${dir}/ignored.test.ts`),
		"apps/web/src/component.tsx",
	];
	const result = run({ status: 0, stdout: `${paths.join("\0")}\0` });
	expect(result.status).toBe(0);
	expect(result.calls[0]).toMatchObject({
		command: "git",
		args: [
			"ls-files",
			"--cached",
			"--others",
			"--exclude-standard",
			"-z",
			"--",
			"apps",
			"packages",
		],
	});
	expect(result.calls[1]).toEqual({
		command: "/synthetic/bun",
		args: [
			"--no-env-file",
			"test",
			"apps/server/src/a.test.ts",
			"packages/ui/src/z.test.tsx",
		],
		options: { cwd: "/synthetic/", stdio: "inherit" },
	});
});

test("offline discovery fails closed on missing Git, failed listing or no eligible tests", () => {
	for (const listing of [
		{ error: new Error("synthetic"), status: null },
		{ status: 128, stdout: "" },
		{ status: 0, stdout: "packages/api/src/db.integration.test.ts\0" },
	]) {
		const result = run(listing);
		expect(result.status).toBe(listing.status === 128 ? 128 : 1);
		expect(result.calls).toHaveLength(1);
	}
});

test("offline runner propagates failing Bun status and fails if the child cannot start", () => {
	for (const child of [
		{ status: 7 },
		{ status: null, error: new Error("synthetic") },
	]) {
		const result = run(
			{ status: 0, stdout: "packages/api/src/a.test.ts\0" },
			child,
		);
		expect(result.status).toBe(child.status ?? 1);
		expect(result.calls).toHaveLength(2);
	}
});
