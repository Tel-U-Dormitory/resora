import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
	maxCsvBytes,
	ProvisioningError,
} from "@resora/api/modules/identity/provisioning-csv";
import {
	localProvisioningTarget,
	provisionSrAccounts,
	verifyLocalProvisioningDatabase,
} from "@resora/api/modules/identity/sr-provisioning";
import { createDb, type Database } from "@resora/db";

// Deliberately no Varlock/services import or DATABASE_URL fallback: local scratch only.
async function main() {
	const args = process.argv.slice(2).filter((arg) => arg !== "--");
	if (args.length === 1 && args[0] === "--help") {
		console.info(
			"sr:provision --input <csv> [--dry-run | --apply] (local RESORA_IDENTITY_TEST_DB_URL only)",
		);
		return;
	}
	let input: string | undefined;
	let mode: "dry-run" | "apply" = "dry-run";
	let modeSet = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (
			arg === "--input" &&
			!input &&
			args[index + 1] &&
			!args[index + 1]?.startsWith("--")
		)
			input = args[++index];
		else if ((arg === "--apply" || arg === "--dry-run") && !modeSet) {
			mode = arg === "--apply" ? "apply" : "dry-run";
			modeSet = true;
		} else throw new ProvisioningError("INVALID_ARGUMENTS_USE_HELP");
	}
	if (!input) throw new ProvisioningError("INPUT_CSV_REQUIRED");
	const url = localProvisioningTarget(process.env.RESORA_IDENTITY_TEST_DB_URL);
	let db: Database | undefined;
	try {
		const path = resolve(input);
		if ((await stat(path)).size > maxCsvBytes)
			throw new ProvisioningError("INVALID_CSV_SIZE_OR_CONTENT");
		const csv = new TextDecoder("utf-8", { fatal: true }).decode(
			await readFile(path),
		);
		db = createDb({ DATABASE_URL: url });
		await verifyLocalProvisioningDatabase(db, url);
		const projectRoot = resolve(import.meta.dir, "../../../..");
		const result = await provisionSrAccounts({
			db,
			csv,
			mode,
			projectRoot,
			authConfig: {
				BETTER_AUTH_URL: "http://127.0.0.1:3000",
				CORS_ORIGIN: "http://localhost:3001",
				BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
			},
		});
		console.info(
			`${result.mode}: ${mode === "dry-run" ? "would create" : "created"}=${result.created}, unchanged=${result.unchanged}`,
		);
		if (result.credentialsFile)
			console.info(
				`Credentials: ${relative(projectRoot, result.credentialsFile)} (check adjacent status.json)`,
			);
	} finally {
		await db?.$client.end();
	}
}

try {
	await main();
} catch (error) {
	console.error(
		error instanceof ProvisioningError
			? error.message
			: "PROVISIONING_FAILED_CHECK_LOCAL_INPUT_AND_TARGET",
	);
	process.exitCode = 1;
}
