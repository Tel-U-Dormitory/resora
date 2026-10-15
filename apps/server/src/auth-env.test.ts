import { expect, test } from "bun:test";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { internal } from "varlock";

for (const [key, defaultValue] of [
	["AUTH_RATE_LIMIT_ENABLED", "true"],
	["AUTH_PERF_DIAGNOSTICS_ENABLED", "false"],
] as const) {
	test(`Varlock ${key} defaults ${defaultValue}, accepts true/false and rejects invalid values`, async () => {
		// Load only this public declaration; never load workstation .env values.
		const schema = await readFile(
			new URL("../.env.schema", import.meta.url),
			"utf8",
		);
		const declaration = schema.match(
			new RegExp(
				`# @public @type=enum\\("true", "false"\\)\\r?\\n${key}="${defaultValue}"`,
			),
		);
		if (!declaration) throw new Error("Strict auth switch declaration missing");
		const directory = await mkdtemp(join(tmpdir(), "resora-auth-config-"));
		const file = join(directory, ".env.schema");
		try {
			await writeFile(
				file,
				`# @defaultRequired=true\n# ---\n${declaration[0]}\n`,
			);
			for (const value of [
				undefined,
				"true",
				"false",
				"invalid",
				"off",
				"0",
				"",
			]) {
				const graph = await internal.loadEnvGraph({
					basePath: directory,
					entryFilePaths: [file],
					processEnvOverride: {},
					overrideValues: value === undefined ? {} : { [key]: value },
					checkGitIgnored: false,
					skipCache: true,
				});
				await graph.resolveEnvValues();
				const valid =
					value === undefined || value === "true" || value === "false";
				expect(graph.isInvalid).toBe(!valid);
				if (valid)
					expect(graph.getResolvedEnvObject()[key]).toBe(value ?? defaultValue);
			}
		} finally {
			await unlink(file);
			await rmdir(directory);
		}
	});
}
