import { fileURLToPath } from "node:url";
import {
	repositorySources,
	violations,
} from "../packages/config/src/architecture";

const root = fileURLToPath(new URL("../", import.meta.url));
const actual = violations(repositorySources(root));
if (actual.length) {
	console.error(actual.join("\n"));
	process.exit(1);
}
console.info("Architecture checks passed (no exceptions).");
