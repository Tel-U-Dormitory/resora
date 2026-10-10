import "varlock/auto-load";

import { fileURLToPath } from "node:url";

import { ENV } from "../src/env";

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--migrate") {
	console.error(
		"Specify --check (read-only) or --migrate (applies reviewed SQL).",
	);
	process.exitCode = 1;
} else {
	console.info(
		"Explicit Session Pooler selection: passing DATABASE_URL as DIRECT_DB_URL for this command only.",
	);
	const child = Bun.spawn(
		[
			process.execPath,
			"run",
			mode === "--check" ? "scripts/check-migration.ts" : "db:migrate",
		],
		{
			cwd: fileURLToPath(new URL("..", import.meta.url)),
			env: { ...process.env, DIRECT_DB_URL: ENV.DATABASE_URL },
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	process.exitCode = await child.exited;
}
