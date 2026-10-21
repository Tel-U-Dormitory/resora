import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import {
	BootstrapError,
	type BootstrapTarget,
	validateBootstrapTarget,
	verifyBootstrapDatabase,
} from "@resora/api/modules/identity/system-admin-bootstrap";
import { createAuth } from "@resora/auth";
import {
	recoveryEligible,
	recoveryUser,
	resetPage,
} from "@resora/auth/password-recovery";
import { createDb } from "@resora/db";
import { z } from "zod";

// Deliberately no services/Varlock import or application DATABASE_URL fallback.
export function parseResetLinkArgs(
	args: string[],
	env: Record<string, string | undefined>,
	terminal: boolean,
) {
	const values = new Map<string, string>();
	let apply = false;
	let dryRun = false;
	for (let i = 0; i < args.length; i++) {
		const key = args[i];
		if (key === "--apply" && !apply) apply = true;
		else if (key === "--dry-run" && !dryRun) dryRun = true;
		else if (
			key &&
			[
				"--target",
				"--database",
				"--project-reference",
				"--confirm-production",
				"--confirm-issue",
				"--email",
				"--nim",
			].includes(key) &&
			!values.has(key) &&
			args[i + 1] &&
			!args[i + 1]?.startsWith("--")
		)
			values.set(key, args[++i] ?? "");
		else throw Error("INVALID_ARGUMENTS");
	}
	if (apply && dryRun) throw Error("INVALID_ARGUMENTS");
	const mode = values.get("--target");
	if (mode !== "local" && mode !== "production")
		throw Error("EXPLICIT_TARGET_REQUIRED");
	const target: BootstrapTarget = {
		mode,
		url: env.RESORA_PASSWORD_RESET_DB_URL ?? "",
		database: values.get("--database") ?? "",
		reference: values.get("--project-reference"),
	};
	validateBootstrapTarget(target);
	if (
		mode === "production" &&
		values.get("--confirm-production") !== target.reference
	)
		throw Error("EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED");
	if (mode === "production" && !env.RESORA_PASSWORD_RESET_SSL_CA)
		throw Error("VERIFIED_PRODUCTION_TLS_CA_REQUIRED");
	const email = values.get("--email");
	const nim = values.get("--nim");
	if (
		!!email === !!nim ||
		(email && !z.email().safeParse(email).success) ||
		(nim && !/^[A-Za-z0-9_.]{3,30}$/.test(nim))
	)
		throw Error("EXACTLY_ONE_REGISTERED_EMAIL_OR_NIM_REQUIRED");
	if (apply && (values.get("--confirm-issue") !== "ISSUE" || !terminal))
		throw Error("EXPLICIT_ISSUANCE_CONFIRMATION_AND_PRIVATE_TERMINAL_REQUIRED");
	const origin = env.RESORA_PASSWORD_RESET_APP_ORIGIN ?? "";
	resetPage(origin);
	if (mode === "production" && new URL(origin).protocol !== "https:")
		throw Error("INVALID_RESET_APPLICATION_ORIGIN");
	return {
		target,
		origin,
		apply,
		selector: email ? { email: email.toLowerCase() } : { username: nim ?? "" },
		ca: env.RESORA_PASSWORD_RESET_SSL_CA,
	};
}

async function main() {
	if (process.argv.includes("--help")) {
		console.info(
			"auth:reset-link --target local|production --database <name> (--email <registered email>|--nim <NIM>) [--project-reference <ref> --confirm-production <ref>] [--apply --confirm-issue ISSUE]. Default dry-run. Explicit RESORA_PASSWORD_RESET_DB_URL and RESORA_PASSWORD_RESET_APP_ORIGIN; verified CA required for Production. Apply requires private interactive stdout; never redirect to logs.",
		);
		return;
	}
	const parsed = parseResetLinkArgs(
		process.argv.slice(2).filter((arg) => arg !== "--"),
		process.env,
		!!process.stdout.isTTY,
	);
	const db = createDb({
		DATABASE_URL: parsed.target.url,
		DB_SSL_CA: parsed.ca,
	});
	try {
		await verifyBootstrapDatabase(
			db,
			parsed.target,
			resolve(import.meta.dir, "../../../.."),
		);
		const schema = await db.$client.query<{ ready: boolean }>(
			"SELECT to_regclass('public.password_reset_audit') IS NOT NULL AS ready",
		);
		if (!schema.rows[0]?.ready)
			throw Error("PASSWORD_RESET_MIGRATION_REQUIRED");
		const target = await recoveryUser(db, parsed.selector);
		if (!target || !(await recoveryEligible(db, target.id)))
			throw Error("TARGET_ACCOUNT_INELIGIBLE");
		if (!parsed.apply) {
			console.info("PASSWORD_RESET_PREFLIGHT_PASS_NO_LINK_ISSUED");
			return;
		}
		let link: string | undefined;
		const auth = createAuth(
			{
				BETTER_AUTH_URL: parsed.origin,
				CORS_ORIGIN: parsed.origin,
				BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
			},
			db,
			[],
			{
				manualLink: (issued) => {
					link = issued;
				},
			},
		);
		// In-process native API only, never a public HTTP capability or client flag.
		await auth.api.requestPasswordReset({ body: { email: target.email } });
		if (!link) throw Error("LINK_NOT_ISSUED");
		process.stdout.write(`${link}\n`); // Only intentional secret output, once to the private operator.
	} finally {
		await db.$client.end();
	}
}

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		const safe = new Set([
			"INVALID_ARGUMENTS",
			"EXPLICIT_TARGET_REQUIRED",
			"EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED",
			"VERIFIED_PRODUCTION_TLS_CA_REQUIRED",
			"EXACTLY_ONE_REGISTERED_EMAIL_OR_NIM_REQUIRED",
			"EXPLICIT_ISSUANCE_CONFIRMATION_AND_PRIVATE_TERMINAL_REQUIRED",
			"INVALID_RESET_APPLICATION_ORIGIN",
			"PASSWORD_RESET_MIGRATION_REQUIRED",
			"TARGET_ACCOUNT_INELIGIBLE",
			"LINK_NOT_ISSUED",
		]);
		console.error(
			error instanceof BootstrapError
				? error.code
				: error instanceof Error && safe.has(error.message)
					? error.message
					: "PASSWORD_RESET_STOPPED_CHECK_TARGET_SCHEMA_AND_ACCOUNT_PRIVATELY",
		);
		process.exitCode = 1;
	}
}
