import { randomBytes } from "node:crypto";
import { relative, resolve } from "node:path";
import {
	BootstrapError,
	type BootstrapTarget,
	bootstrapSystemAdmin,
	validateBootstrapTarget,
} from "@resora/api/modules/provisioning/system-admin-bootstrap";
import { createDb, type Database } from "@resora/db";

// No Varlock/services import, DATABASE_URL/PROD_* fallback or startup invocation.
async function main() {
	const args = process.argv.slice(2).filter((arg) => arg !== "--");
	if (args.length === 1 && args[0] === "--help") {
		console.info(
			"system-admin:bootstrap --target local|production --database <name> --username <admin username> --name <account name> --email <admin email> [--project-reference <ref> --confirm-production] [--apply] (default dry-run; explicit RESORA_SYSTEM_ADMIN_BOOTSTRAP_DB_URL)",
		);
		return;
	}
	const values = new Map<string, string>();
	let apply = false;
	let confirmProduction = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--apply" && !apply) apply = true;
		else if (arg === "--confirm-production" && !confirmProduction)
			confirmProduction = true;
		else if (
			arg &&
			[
				"--target",
				"--database",
				"--username",
				"--name",
				"--email",
				"--project-reference",
			].includes(arg) &&
			!values.has(arg) &&
			args[index + 1] &&
			!args[index + 1]?.startsWith("--")
		)
			values.set(arg, args[++index] ?? "");
		else throw new BootstrapError("INVALID_ARGUMENTS_USE_HELP");
	}
	const mode = values.get("--target");
	if (mode !== "local" && mode !== "production")
		throw new BootstrapError("EXPLICIT_TARGET_REQUIRED");
	if (mode === "production" && !confirmProduction)
		throw new BootstrapError("EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED");
	const target: BootstrapTarget = {
		mode,
		url: process.env.RESORA_SYSTEM_ADMIN_BOOTSTRAP_DB_URL ?? "",
		database: values.get("--database") ?? "",
		reference: values.get("--project-reference"),
	};
	validateBootstrapTarget(target);
	const ca = process.env.RESORA_SYSTEM_ADMIN_BOOTSTRAP_SSL_CA;
	if (mode === "production" && !ca)
		throw new BootstrapError("VERIFIED_PRODUCTION_TLS_CA_REQUIRED");
	let db: Database | undefined;
	try {
		db = createDb({ DATABASE_URL: target.url, DB_SSL_CA: ca });
		const root = resolve(import.meta.dir, "../../../..");
		const result = await bootstrapSystemAdmin({
			db,
			target,
			projectRoot: root,
			mode: apply ? "apply" : "dry-run",
			input: {
				username: values.get("--username") ?? "",
				name: values.get("--name") ?? "",
				email: values.get("--email") ?? "",
			},
			authConfig: {
				BETTER_AUTH_URL: "http://127.0.0.1:3000",
				CORS_ORIGIN: "http://127.0.0.1:3001",
				BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
				NODE_ENV: "test",
			},
		});
		console.info(
			JSON.stringify({
				target: mode,
				database: target.database,
				mode: result.mode,
				created: result.created,
				planned: result.planned,
				credentialsFile:
					"credentialsFile" in result && result.credentialsFile
						? relative(root, result.credentialsFile)
						: undefined,
				exportState: apply ? "COMMITTED" : undefined,
			}),
		);
	} finally {
		await db?.$client.end();
	}
}
try {
	await main();
} catch (error) {
	console.error(
		error instanceof BootstrapError
			? error.code
			: "BOOTSTRAP_STOPPED_CHECK_INPUT_TARGET_HISTORY_PRIVILEGES_PRIVATELY",
	);
	process.exitCode = 1;
}
