import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

test("native Vercel bridge imports generated ESM instead of extensionless source", () => {
	const bridge = readFileSync(new URL("app.mjs", root), "utf8");
	expect(bridge).toContain('import "express"');
	expect(bridge).toContain('import("./dist/app.mjs")');
	expect(bridge).not.toContain("./src/");
	expect(existsSync(new URL("app.ts", root))).toBe(false);
	const build = readFileSync(new URL("tsdown.config.ts", root), "utf8");
	expect(build).toContain('app: "./src/vercel-app.ts"');
	expect(build).toContain('index: "./src/index.ts"');
});

test("Vercel packages generated chunks and API Varlock schema with the bridge", () => {
	const config = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
	expect(config.framework).toBe("express");
	expect(config.buildCommand).toBe("pnpm run build");
	expect(config.functions["app.mjs"].includeFiles).toBe(
		"{dist/**,.env.schema}",
	);
});
