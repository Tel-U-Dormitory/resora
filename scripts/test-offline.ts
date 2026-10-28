import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Git includes tracked and new tests while honoring repository/local ignore rules.
const listing = spawnSync(
	"git",
	[
		"ls-files",
		"--cached",
		"--others",
		"--exclude-standard",
		"-z",
		"--",
		"apps",
		"packages",
	],
	{ cwd: root, encoding: "utf8" },
);
if (listing.error || listing.status !== 0) {
	console.error("Unable to discover offline tests through Git.");
	process.exit(listing.status ?? 1);
}
const files = [...new Set(listing.stdout.split("\0"))]
	.filter(
		(file) =>
			/\.test\.tsx?$/.test(file) &&
			!/\.integration\.test\.tsx?$/.test(file) &&
			!/\/(?:node_modules|dist|build|coverage|tmp|temp|\.next|\.turbo|generated|_generated|__generated__)\//.test(
				file,
			),
	)
	.sort();
if (!files.length) {
	console.error("No offline app/package tests found.");
	process.exit(1);
}
console.info(`Running ${files.length} offline app/package test files.`);
const result = spawnSync(
	process.execPath,
	["--no-env-file", "test", ...files],
	{
		cwd: root,
		stdio: "inherit",
	},
);
if (result.error) console.error("Unable to start the offline test process.");
process.exit(result.status ?? 1);
