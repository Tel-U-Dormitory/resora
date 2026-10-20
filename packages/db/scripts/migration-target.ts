import { createHash, X509Certificate } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSecureContext } from "node:tls";
import { parseEnv } from "node:util";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getPoolConfig } from "../src/pool-config";

export class MigrationError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}
export type MigrationArgs = {
	target: "dev" | "prod";
	apply: boolean;
	confirm?: string;
};
export function parseMigrationArgs(args: string[]): MigrationArgs {
	const [target, ...flags] = args;
	if (target !== "dev" && target !== "prod")
		throw new MigrationError("EXPLICIT_DEV_OR_PROD_REQUIRED");
	let check = false;
	let apply = false;
	let confirm: string | undefined;
	for (let i = 0; i < flags.length; i++) {
		if (flags[i] === "--check" && !check) check = true;
		else if (flags[i] === "--apply" && !apply) apply = true;
		else if (
			flags[i] === "--confirm" &&
			confirm === undefined &&
			flags[i + 1] &&
			!flags[i + 1]?.startsWith("--")
		)
			confirm = flags[++i];
		else throw new MigrationError("INVALID_MIGRATION_ARGUMENTS");
	}
	if (
		(check && apply) ||
		(confirm && (target !== "prod" || !apply)) ||
		(target === "dev" && apply)
	)
		throw new MigrationError("INVALID_MIGRATION_ARGUMENTS");
	if (target === "prod" && !check && !apply)
		throw new MigrationError("PRODUCTION_REQUIRES_CHECK_OR_EXPLICIT_APPLY");
	if (target === "prod" && apply && !confirm)
		throw new MigrationError("PRODUCTION_CONFIRMATION_REQUIRED");
	return { target, apply: target === "dev" ? !check : apply, confirm };
}

const keys = [
	"DB_MIGRATION_URL",
	"DB_PROJECT_REF",
	"DB_CONNECTION_MODE",
	"DB_CA_FILE",
] as const;
export function parseMigrationFile(
	content: string,
): Record<(typeof keys)[number], string> {
	const result: Record<string, string> = {};
	for (const raw of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (
			!match ||
			!keys.includes(match[1] as (typeof keys)[number]) ||
			Object.hasOwn(result, match[1] ?? "")
		)
			throw new MigrationError("INVALID_OR_DUPLICATE_MIGRATION_CONFIG");
		const literal = match[2] ?? "";
		if (literal.startsWith('"') || literal.startsWith("'")) {
			if (
				!new RegExp(
					`^${literal[0]}[^${literal[0]}]*${literal[0]}\\s*(?:#.*)?$`,
				).test(literal)
			)
				throw new MigrationError("INVALID_MIGRATION_CONFIG_QUOTING");
		}
		const key = match[1] ?? "";
		const value = parseEnv(line)[key];
		if (!value?.trim() || value.includes("${") || value.includes("\0"))
			throw new MigrationError("INVALID_MIGRATION_CONFIG_VALUE");
		result[key] = value;
	}
	if (keys.some((key) => !result[key]))
		throw new MigrationError("MISSING_MIGRATION_CONFIG_FIELDS");
	return result as Record<(typeof keys)[number], string>;
}

export function validateMigrationTarget(
	config: ReturnType<typeof parseMigrationFile>,
) {
	const reference = config.DB_PROJECT_REF;
	const mode = config.DB_CONNECTION_MODE;
	let url: URL;
	try {
		url = new URL(config.DB_MIGRATION_URL);
	} catch {
		throw new MigrationError("INVALID_MIGRATION_URL");
	}
	if (
		!/^[a-z0-9]{20}$/.test(reference) ||
		!["direct", "session"].includes(mode)
	)
		throw new MigrationError("INVALID_PROJECT_OR_CONNECTION_MODE");
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.port !== "5432" ||
		url.pathname !== "/postgres" ||
		url.search ||
		url.hash ||
		!url.password
	)
		throw new MigrationError(
			"DIRECT_OR_SESSION_5432_URL_WITHOUT_OPTIONS_REQUIRED",
		);
	let username: string;
	let password: string;
	try {
		username = decodeURIComponent(url.username);
		password = decodeURIComponent(url.password);
	} catch {
		throw new MigrationError("INVALID_URL_ENCODING");
	}
	const role =
		mode === "session" ? username.slice(0, -(reference.length + 1)) : username;
	if (
		!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role) ||
		!password ||
		password.includes("\0")
	)
		throw new MigrationError("INVALID_MIGRATION_CREDENTIALS");
	if (
		mode === "direct"
			? url.hostname !== `db.${reference}.supabase.co`
			: !/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) ||
				username !== `${role}.${reference}`
	)
		throw new MigrationError("PROJECT_OR_CONNECTION_MODE_MISMATCH");
	return {
		reference,
		mode: mode as "direct" | "session",
		url,
		username,
		password,
		role,
	};
}

export function loadMigrationTarget(root: string, target: "dev" | "prod") {
	const directory = resolve(root, ".private/db-migration");
	let config: ReturnType<typeof parseMigrationFile>;
	try {
		config = parseMigrationFile(
			readFileSync(resolve(directory, `${target}.env`), "utf8"),
		);
	} catch (error) {
		if (error instanceof MigrationError) throw error;
		throw new MigrationError("PRIVATE_TARGET_CONFIG_UNREADABLE");
	}
	const selected = validateMigrationTarget(config);
	let ca: string;
	try {
		ca = readFileSync(resolve(directory, config.DB_CA_FILE), "utf8");
		const certificates = ca.match(
			/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
		);
		if (!certificates?.length || ca.includes("PRIVATE KEY")) throw Error();
		for (const pem of certificates) {
			const certificate = new X509Certificate(pem);
			if (
				!certificate.ca ||
				Date.parse(certificate.validFrom) > Date.now() ||
				Date.parse(certificate.validTo) <= Date.now()
			)
				throw Error();
		}
		createSecureContext({ ca });
	} catch {
		throw new MigrationError("CA_FILE_UNREADABLE_OR_INVALID");
	}
	const pool = getPoolConfig({
		DATABASE_URL: selected.url.href,
		DB_SSL_CA: ca,
		DB_POOL_MAX: 1,
	});
	return {
		...selected,
		target,
		credentials: {
			host: selected.url.hostname,
			port: 5432,
			user: selected.username,
			password: selected.password,
			database: "postgres",
			ssl: {
				...(pool.ssl as object),
				ca,
				rejectUnauthorized: true as const,
				servername: selected.url.hostname,
			},
			connectionTimeoutMillis: pool.connectionTimeoutMillis,
			options: "-c application_name=resora-migration",
			application_name: "resora-migration",
			sslnegotiation: "postgres" as const,
		},
	};
}
export type MigrationTarget = ReturnType<typeof loadMigrationTarget>;
export function approveMigration(args: MigrationArgs, target: MigrationTarget) {
	if (args.target !== target.target)
		throw new MigrationError("MIGRATION_TARGET_MISMATCH");
	if (args.target === "prod" && args.apply && args.confirm !== target.reference)
		throw new MigrationError("PRODUCTION_CONFIRMATION_MISMATCH");
}

export function localMigrations(root: string) {
	const folder = resolve(root, "packages/db/src/migrations");
	try {
		const migrations = readMigrationFiles({ migrationsFolder: folder });
		const directories = readdirSync(folder, { withFileTypes: true }).filter(
			(entry) => entry.isDirectory(),
		);
		if (
			!migrations.length ||
			directories.length !== migrations.length ||
			migrations.some(
				(migration) => !/^\d{14}_[a-z0-9_]+$/.test(migration.name ?? ""),
			)
		)
			throw Error();
		return migrations;
	} catch {
		throw new MigrationError("INVALID_LOCAL_MIGRATION_CHAIN");
	}
}
export type LocalMigrations = ReturnType<typeof localMigrations>;
export class MigrationHistoryError extends MigrationError {
	constructor(
		readonly reason:
			| "APPLIED_MIGRATION_MISSING_LOCALLY"
			| "SQL_HASH_MISMATCH"
			| "MIGRATION_NAME_MISMATCH"
			| "DATABASE_HISTORY_LONGER_THAN_LOCAL",
		readonly position: number,
		readonly localName: string | undefined,
		readonly databaseName: string | null | undefined,
	) {
		super("MIGRATION_HISTORY_DIVERGED");
	}
}
export function pendingMigrations(
	local: LocalMigrations,
	applied: { hash: string; name?: string | null }[],
	namedHistory: boolean,
) {
	for (const [index, row] of applied.entries()) {
		const expected = local[index];
		let reason: MigrationHistoryError["reason"] | undefined;
		if (!expected) reason = "DATABASE_HISTORY_LONGER_THAN_LOCAL";
		else if (namedHistory && row.name && row.name !== expected.name) {
			reason =
				row.hash !== expected.hash &&
				!local.some((migration) => migration.name === row.name)
					? "APPLIED_MIGRATION_MISSING_LOCALLY"
					: "MIGRATION_NAME_MISMATCH";
		} else if (row.hash !== expected.hash) reason = "SQL_HASH_MISMATCH";
		else if (namedHistory && row.name !== expected.name)
			reason = "MIGRATION_NAME_MISMATCH";
		if (reason)
			throw new MigrationHistoryError(
				reason,
				index + 1,
				expected?.name,
				namedHistory ? row.name : undefined,
			);
	}
	return local.slice(applied.length);
}
export function migrationFingerprint(
	target: MigrationTarget,
	migrations: LocalMigrations,
) {
	return createHash("sha256")
		.update(
			JSON.stringify({
				credentials: target.credentials,
				target: target.target,
				mode: target.mode,
				reference: target.reference,
				migrations: migrations.map(({ name, hash }) => ({ name, hash })),
			}),
		)
		.digest("hex");
}
