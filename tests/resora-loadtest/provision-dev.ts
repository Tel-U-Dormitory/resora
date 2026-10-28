import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
	type InitialCredential,
	prepareCredentials,
} from "../../packages/api/src/modules/provisioning/provisioning-credentials";
import {
	maxCsvBytes,
	ProvisioningError,
	parseSrCsv,
	type SrImportRow,
} from "../../packages/api/src/modules/provisioning/provisioning-csv";
import { provisionSrAccounts } from "../../packages/api/src/modules/provisioning/sr-provisioning";
import { BootstrapError } from "../../packages/api/src/modules/provisioning/system-admin-bootstrap";
import { createDb, type Database } from "../../packages/db/src/index";

const projectRoot = resolve(import.meta.dir, "../..");
const rosterPath = join(import.meta.dir, "sr-loadtest-50.csv");
const prefix = "lt_resora_20261014_";
type Mode = "check" | "dry-run" | "apply" | "verify";
type PreflightStage =
	| "TARGET"
	| "TLS"
	| "CONNECTION"
	| "DB_IDENTITY"
	| "SCHEMA"
	| "MIGRATION_HISTORY"
	| "ORG_REFERENCES";

const networkCodes = new Set([
	"ENOTFOUND",
	"EAI_AGAIN",
	"ENETUNREACH",
	"EHOSTUNREACH",
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EPIPE",
	"ENOENT",
	"EACCES",
]);
const tlsCodes = new Set([
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"CERT_HAS_EXPIRED",
	"CERT_NOT_YET_VALID",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"UNABLE_TO_GET_ISSUER_CERT",
]);

function safeSystemCode(error: unknown): string | undefined {
	let current = error;
	// Drizzle/driver wrappers may retain the SQLSTATE in cause; never read messages.
	for (let depth = 0; depth < 5; depth++) {
		if (typeof current !== "object" || current === null) return;
		const detail = current as {
			code?: unknown;
			cause?: unknown;
			errors?: unknown[];
		};
		if (
			typeof detail.code === "string" &&
			(networkCodes.has(detail.code) ||
				tlsCodes.has(detail.code) ||
				/^[0-9A-Z]{5}$/.test(detail.code))
		)
			return detail.code;
		current = detail.cause ?? detail.errors?.[0];
	}
}

function safeFailureCode(error: unknown) {
	if (
		(error instanceof ProvisioningError || error instanceof BootstrapError) &&
		/^[A-Z][A-Z0-9_]{1,100}$/.test(error.code)
	)
		return error.code;
	return safeSystemCode(error) ?? "UNKNOWN_ERROR";
}

class PreflightFailure extends Error {
	constructor(
		readonly stage: PreflightStage,
		readonly code: string,
		readonly causeCode?: string,
	) {
		super(
			`DEV_PREFLIGHT_FAILED stage=${stage} code=${code}${causeCode ? ` causeCode=${causeCode}` : ""}`,
		);
	}
}

async function atStage<T>(stage: PreflightStage, action: () => T | Promise<T>) {
	try {
		return await action();
	} catch (error) {
		if (error instanceof PreflightFailure) throw error;
		throw new PreflightFailure(stage, safeFailureCode(error));
	}
}

export function diagnosticMessage(error: unknown) {
	if (error instanceof PreflightFailure)
		return `DEV_PREFLIGHT_FAILED stage=${error.stage} code=${error.code}${error.causeCode ? ` causeCode=${error.causeCode}` : ""}`;
	return `DEV_LOADTEST_PREPARATION_FAILED code=${safeFailureCode(error)}`;
}

export function parseArguments(args: string[]) {
	let mode: Mode = "dry-run";
	let modeSet = false;
	let confirmDev: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (
			["--check", "--dry-run", "--apply", "--verify"].includes(arg ?? "") &&
			!modeSet
		) {
			mode = arg?.slice(2) as Mode;
			modeSet = true;
		} else if (
			arg === "--confirm-dev" &&
			!confirmDev &&
			args[index + 1] &&
			!args[index + 1]?.startsWith("--")
		) {
			confirmDev = args[++index];
		} else throw new ProvisioningError("INVALID_ARGUMENTS");
	}
	return { mode, confirmDev };
}

export function developmentTarget(
	value: string | undefined,
	expectedDev: string | undefined,
	knownProd: string | undefined,
	mode: Mode,
	confirmation?: string,
) {
	if (
		!expectedDev ||
		!knownProd ||
		!/^[a-z]{20}$/.test(expectedDev) ||
		!/^[a-z]{20}$/.test(knownProd) ||
		expectedDev === knownProd
	)
		throw new ProvisioningError(
			"DISTINCT_EXPLICIT_DEV_AND_PROD_REFERENCES_REQUIRED",
		);
	if (mode === "apply" && confirmation !== expectedDev)
		throw new ProvisioningError("MATCHING_DEV_APPLY_CONFIRMATION_REQUIRED");
	let parsed: URL;
	try {
		if (!value) throw new Error();
		parsed = new URL(value);
	} catch {
		throw new ProvisioningError("EXPLICIT_DEV_URL_REQUIRED");
	}
	if (
		!["postgres:", "postgresql:"].includes(parsed.protocol) ||
		!parsed.password ||
		parsed.pathname !== "/postgres" ||
		(parsed.port && parsed.port !== "5432") ||
		parsed.hash
	)
		throw new ProvisioningError("DEV_DIRECT_OR_SESSION_POOLER_5432_REQUIRED");
	const direct =
		parsed.hostname === `db.${expectedDev}.supabase.co` &&
		parsed.username === "postgres";
	const session =
		/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname) &&
		parsed.username === `postgres.${expectedDev}`;
	if (!direct && !session)
		throw new ProvisioningError("DEV_PROJECT_TARGET_MISMATCH");
	for (const [key, value] of parsed.searchParams) {
		if (
			!(key === "sslmode" && value === "require") &&
			!(key === "uselibpqcompat" && value === "true")
		)
			throw new ProvisioningError("DEV_CONNECTION_OPTIONS_NOT_ALLOWED");
	}
	parsed.port = "5432";
	// Temporary DEV testing only: encryption required, server identity NOT verified.
	// pg-connection-string 2.14.1 applies libpq require semantics without a CA.
	parsed.searchParams.set("sslmode", "require");
	parsed.searchParams.set("uselibpqcompat", "true");
	return {
		url: parsed.toString(),
		reference: expectedDev,
		connectionMode: direct ? "DIRECT" : "SESSION_POOLER",
	};
}

export function validateRoster(csv: string) {
	const rows = parseSrCsv(csv);
	if (rows.length !== 50)
		throw new ProvisioningError("EXACTLY_50_SYNTHETIC_ACCOUNTS_REQUIRED");
	for (const row of rows) {
		const suffix = row.nim.slice(prefix.length);
		if (
			!row.nim.startsWith(prefix) ||
			!/^\d{3}$/.test(suffix) ||
			Number(suffix) < 1 ||
			Number(suffix) > 50 ||
			row.name !== `RESORA Load Test ${suffix}` ||
			row.email !== `resora-loadtest-20261014-${suffix}@example.com` ||
			row.department !== "RND" ||
			row.position !== "ANGGOTA" ||
			row.building !== "A" ||
			!row.is_active
		)
			throw new ProvisioningError(
				"UNEXPECTED_SYNTHETIC_ROSTER_ROW",
				row.record,
			);
	}
	return rows;
}

export async function readRoster(path = rosterPath) {
	try {
		if ((await stat(path)).size > maxCsvBytes) throw new Error();
		return new TextDecoder("utf-8", { fatal: true }).decode(
			await readFile(path),
		);
	} catch {
		throw new ProvisioningError("LOADTEST_CSV_MISSING_OR_UNREADABLE");
	}
}

export async function verifyDevelopmentDatabase(
	db: Database,
	target: ReturnType<typeof developmentTarget>,
) {
	await atStage("CONNECTION", async () => {
		if (db.$client.options.connectionString !== target.url)
			throw new ProvisioningError("DEV_POOL_TARGET_MISMATCH");
		try {
			const client = await db.$client.connect();
			client.release();
		} catch (error) {
			const code = safeSystemCode(error);
			throw new PreflightFailure(
				tlsCodes.has(code ?? "") ? "TLS" : "CONNECTION",
				safeFailureCode(error),
			);
		}
	});
	await atStage("DB_IDENTITY", async () => {
		const identity = await db.$client.query<{ name: string; role: string }>(
			"SELECT current_database() AS name, current_user AS role",
		);
		if (
			identity.rows[0]?.name !== "postgres" ||
			identity.rows[0]?.role !== "postgres"
		)
			throw new ProvisioningError("DEV_CONNECTION_IDENTITY_MISMATCH");
	});
	const required = [
		"user",
		"account",
		"session",
		"rate_limit",
		"user_profiles",
		"sr_profiles",
		"system_privileges",
		"departments",
		"positions",
		"buildings",
	];
	await atStage("SCHEMA", async () => {
		const tables = await db.$client.query<{ ready: boolean }>(
			"SELECT bool_and(to_regclass(format('public.%I', name)) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name",
			[required],
		);
		if (!tables.rows[0]?.ready)
			throw new ProvisioningError("DEV_SCHEMA_PREREQUISITES_MISSING");
	});
	await atStage("MIGRATION_HISTORY", async () => {
		const migrations = join(projectRoot, "packages/db/src/migrations");
		const folders = (await readdir(migrations))
			.filter((name) => /^\d{14}_/.test(name))
			.sort();
		const history = await db.$client.query<{ hash: string }>(
			"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
		);
		if (history.rows.length < 3 || history.rows.length > folders.length)
			throw new ProvisioningError("DEV_MIGRATION_HISTORY_MISMATCH");
		for (const [index, entry] of history.rows.entries()) {
			const folder = folders[index];
			if (!folder)
				throw new ProvisioningError("DEV_MIGRATION_HISTORY_MISMATCH");
			const hash = createHash("sha256")
				.update(
					await readFile(join(migrations, folder, "migration.sql"), "utf8"),
				)
				.digest("hex");
			if (entry.hash !== hash)
				throw new ProvisioningError("DEV_MIGRATION_HISTORY_MISMATCH");
		}
	});
	await atStage("ORG_REFERENCES", async () => {
		const refs = await db.$client.query<{ ready: boolean }>(
			"SELECT EXISTS(SELECT 1 FROM departments WHERE code='RND' AND is_active) AND EXISTS(SELECT 1 FROM positions WHERE code='ANGGOTA' AND is_active) AND EXISTS(SELECT 1 FROM buildings WHERE code='A' AND is_active) AS ready",
		);
		if (!refs.rows[0]?.ready)
			throw new ProvisioningError("ACTIVE_LOADTEST_REFERENCES_REQUIRED");
	});
}

export function validateAccountState(matched: number, grants: number) {
	if (grants !== 0) throw new ProvisioningError("LOADTEST_PRIVILEGE_CONFLICT");
	if (matched !== 0 && matched !== 50)
		throw new ProvisioningError("PARTIAL_OR_UNEXPECTED_LOADTEST_STATE");
}

export async function prepareLoadtestCredentials(
	records: readonly InitialCredential[],
) {
	// Called inside the existing provisioning transaction, before any account writes.
	if (records.length !== 50)
		throw new ProvisioningError("PARTIAL_OR_UNEXPECTED_LOADTEST_STATE");
	return prepareCredentials(projectRoot, records);
}

export async function inspectAccounts(db: Database, rows: SrImportRow[]) {
	const result = await db.$client.query<{
		matched: number;
		grants: number;
		credentials: number;
		profiles: number;
		initialFlags: number;
	}>(
		`SELECT count(*)::int AS matched,
		 count(*) FILTER (WHERE EXISTS(SELECT 1 FROM system_privileges p WHERE p.user_id=u.id))::int AS grants,
		 count(*) FILTER (WHERE (SELECT count(*) FROM account a WHERE a.user_id=u.id AND a.provider_id='credential' AND a.account_id=u.id AND a.password IS NOT NULL)=1)::int AS credentials,
		 count(*) FILTER (WHERE EXISTS(SELECT 1 FROM user_profiles p JOIN sr_profiles s ON s.user_id=p.user_id JOIN buildings b ON b.id=s.building_id WHERE p.user_id=u.id AND p.actor='SR' AND p.is_active AND s.department_code='RND' AND s.position_code='ANGGOTA' AND b.code='A' AND b.is_active))::int AS profiles,
		 count(*) FILTER (WHERE EXISTS(SELECT 1 FROM user_profiles p WHERE p.user_id=u.id AND p.must_change_password))::int AS "initialFlags"
		 FROM "user" u WHERE u.username=ANY($1::text[]) OR lower(u.email)=ANY($2::text[]) OR starts_with(u.username,$3)`,
		[rows.map((row) => row.nim), rows.map((row) => row.email), prefix],
	);
	const state = result.rows[0];
	if (!state)
		throw new ProvisioningError("LOADTEST_ACCOUNT_VERIFICATION_FAILED");
	validateAccountState(state.matched, state.grants);
	if (
		state.matched === 50 &&
		(state.credentials !== 50 || state.profiles !== 50)
	)
		throw new ProvisioningError("LOADTEST_ACCOUNT_VERIFICATION_FAILED");
	return state;
}

export async function run(args: string[], env: NodeJS.ProcessEnv) {
	const options = await atStage("TARGET", () => parseArguments(args));
	const target = await atStage("TARGET", () =>
		developmentTarget(
			env.RESORA_LOADTEST_DEV_DB_URL,
			env.RESORA_LOADTEST_DEV_PROJECT_REF,
			env.RESORA_LOADTEST_PROD_PROJECT_REF,
			options.mode,
			options.confirmDev,
		),
	);
	// Only this explicit URL is used. No Varlock/runtime/PROD/Development fallback.
	const db = await atStage("CONNECTION", () =>
		createDb({
			DATABASE_URL: target.url,
			DB_POOL_MAX: 1,
		}),
	);
	try {
		await verifyDevelopmentDatabase(db, target);
		console.info(
			`DEV target verified (${target.connectionMode}, encrypted TLS; server certificate identity NOT verified)`,
		);
		if (options.mode === "check") return;
		const csv = await readRoster();
		const rows = validateRoster(csv);
		await inspectAccounts(db, rows);
		const base = {
			db,
			csv,
			projectRoot,
			authConfig: {
				BETTER_AUTH_URL: "http://127.0.0.1:3000",
				CORS_ORIGIN: "http://localhost:3001",
				BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
			},
		};
		const preview = await provisionSrAccounts({ ...base, mode: "dry-run" });
		validateAccountState(preview.unchanged, 0);
		console.info(
			`dry-run: valid=50, new=${preview.created}, unchanged=${preview.unchanged}, conflicts=0`,
		);
		if (options.mode === "dry-run") return;
		if (options.mode === "verify" && preview.unchanged !== 50)
			throw new ProvisioningError("LOADTEST_ACCOUNTS_NOT_ALL_PRESENT");
		if (options.mode === "apply") {
			const result = await provisionSrAccounts({
				...base,
				mode: "apply",
				// Also fail before writes if an external race leaves a partial batch.
				prepareOutput: prepareLoadtestCredentials,
			});
			console.info(
				`apply: created=${result.created}, unchanged=${result.unchanged}`,
			);
			if (result.credentialsFile)
				console.info(
					`Credentials: ${relative(projectRoot, result.credentialsFile)} (status COMMITTED; never print/distribute)`,
				);
		}
		const state = await inspectAccounts(db, rows);
		if (state.matched !== 50)
			throw new ProvisioningError("LOADTEST_ACCOUNTS_NOT_ALL_PRESENT");
		console.info(
			`verified: users=50, credentials=50, active SR profiles=50, grants=0, initialFlags=${state.initialFlags}`,
		);
	} finally {
		await db.$client.end();
	}
}

if (import.meta.main) {
	try {
		await run(process.argv.slice(2), process.env);
	} catch (error) {
		console.error(diagnosticMessage(error));
		process.exitCode = 1;
	}
}
