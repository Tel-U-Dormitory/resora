import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
test("Docker context excludes credentials, account CSV and env values without unignore overrides", () => {
	const rules = readFileSync(new URL(".dockerignore", root), "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
	for (const pattern of [
		".private",
		"**/.private",
		"**/*.csv",
		"**/.env",
		"**/.env.*",
		"tmp",
		"temp",
		"**/.pgpass",
		"**/pgpass.conf",
	])
		expect(rules).toContain(pattern);
	expect(rules.filter((line) => line.startsWith("!"))).toEqual([
		"!**/.env.example",
		"!**/.env.schema",
	]);
});

test("standalone copy removes nested env values; runtime entrypoints and secret mounts stay intact", () => {
	const web = readFileSync(new URL("apps/web/Dockerfile", root), "utf8");
	const server = readFileSync(new URL("apps/server/Dockerfile", root), "utf8");
	expect(web).toContain(
		"find .next/standalone -type f -name '.env*' ! -name '.env.schema' ! -name '.env.example' -delete",
	);
	expect(web).toContain(
		'CMD ["node", "--import", "varlock/auto-load", "server.js"]',
	);
	expect(server).toContain('CMD ["bun", "dist/index.mjs"]');
	for (const file of [web, server]) {
		expect(file).toContain("--mount=type=secret,id=web_env");
		expect(file).toContain("--mount=type=secret,id=server_env");
	}
});
