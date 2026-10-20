import "varlock/auto-load";

import { fileURLToPath } from "node:url";

import { ENV } from "../src/env";

const mode = process.argv[2];
if (mode !== "--check") {
	console.error(
		"Use --check for legacy read-only connectivity. Migrations now require the root pnpm db:migrate dev|prod workflow documented in docs/setup.md.",
	);
	process.exitCode = 1;
} else {
	console.info(
		"Explicit Session Pooler selection: passing DATABASE_URL as DIRECT_DB_URL for this command only.",
	);
	const child = Bun.spawn(
		[process.execPath, "run", "scripts/check-migration.ts"],
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
