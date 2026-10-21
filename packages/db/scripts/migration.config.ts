import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";
import {
	approveMigration,
	loadMigrationTarget,
	localMigrations,
	MigrationError,
	migrationFingerprint,
} from "./migration-target";

// Called only by migrate.ts. Never import Varlock or application environment here.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const targetName = process.env.RESORA_DB_MIGRATION_TARGET;
if (targetName !== "dev" && targetName !== "prod")
	throw new MigrationError("EXPLICIT_DEV_OR_PROD_REQUIRED");
const target = loadMigrationTarget(root, targetName);
approveMigration(
	{
		target: targetName,
		apply: true,
		confirm: process.env.RESORA_DB_MIGRATION_CONFIRM,
	},
	target,
);
if (
	process.env.RESORA_DB_MIGRATION_FINGERPRINT !==
	migrationFingerprint(target, localMigrations(root))
)
	throw new MigrationError("MIGRATION_INPUT_CHANGED_REPEAT_PREFLIGHT");
export default defineConfig({
	schema: "./src/schema/index.ts",
	out: "./src/migrations",
	dialect: "postgresql",
	schemaFilter: ["public"],
	dbCredentials: target.credentials,
});
