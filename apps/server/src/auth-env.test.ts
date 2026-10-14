import { expect, test } from "bun:test";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { internal } from "varlock";

test("Varlock auth switch defaults on, accepts true/false and fails invalid values", async () => {
	// Load only this public declaration; never load workstation .env values.
	const schema = await readFile(
		new URL("../.env.schema", import.meta.url),
		"utf8",
	);
	const declaration = schema.match(
		/# @public @type=enum\("true", "false"\)\r?\nAUTH_RATE_LIMIT_ENABLED="true"/,
	);
	if (!declaration)
		throw new Error("Strict default-on auth switch declaration missing");
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
				overrideValues:
					value === undefined ? {} : { AUTH_RATE_LIMIT_ENABLED: value },
				checkGitIgnored: false,
				skipCache: true,
			});
			await graph.resolveEnvValues();
			const valid =
				value === undefined || value === "true" || value === "false";
			expect(graph.isInvalid).toBe(!valid);
			if (valid)
				expect(graph.getResolvedEnvObject().AUTH_RATE_LIMIT_ENABLED).toBe(
					value ?? "true",
				);
		}
	} finally {
		await unlink(file);
		await rmdir(directory);
	}
});
