import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	repositorySources,
	violations,
} from "../packages/config/src/architecture";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline: string[] = JSON.parse(
	readFileSync(
		new URL("../packages/config/architecture-baseline.json", import.meta.url),
		"utf8",
	),
);
const actual = violations(repositorySources(root));
const unexpected = actual.filter((item) => !baseline.includes(item));
const stale = baseline.filter((item) => !actual.includes(item));
if (unexpected.length || stale.length) {
	console.error(
		[
			...unexpected,
			...stale.map((item) => `Remove resolved exception: ${item}`),
		].join("\n"),
	);
	process.exit(1);
}
console.info(
	`Architecture checks passed (${baseline.length} explicit transitional exceptions).`,
);
