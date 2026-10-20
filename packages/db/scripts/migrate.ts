import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { checkServerIdentity, TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import {
	approveMigration,
	type LocalMigrations,
	loadMigrationTarget,
	localMigrations,
	MigrationError,
	type MigrationTarget,
	migrationFingerprint,
	parseMigrationArgs,
	pendingMigrations,
} from "./migration-target";

export function verifiedMigrationTls(
	client: PoolClient,
	target: MigrationTarget,
) {
	const connected = client as PoolClient & {
		host?: string;
		port?: number;
		ssl?: { ca?: string; rejectUnauthorized?: boolean };
		connection?: { stream?: TLSSocket };
	};
	const socket = connected.connection?.stream;
	if (
		connected.host !== target.credentials.host ||
		connected.port !== 5432 ||
		connected.ssl?.rejectUnauthorized !== true ||
		connected.ssl.ca !== target.credentials.ssl.ca ||
		!(socket instanceof TLSSocket) ||
		!socket.encrypted ||
		!socket.authorized ||
		socket.destroyed ||
		!socket.getProtocol() ||
		checkServerIdentity(target.credentials.host, socket.getPeerCertificate())
	)
		throw new MigrationError("VERIFIED_CLIENT_TLS_REQUIRED");
}

export async function migrationPreflight(
	client: PoolClient,
	target: MigrationTarget,
	local: LocalMigrations,
) {
	verifiedMigrationTls(client, target);
	await client.query("BEGIN READ ONLY");
	try {
		const identity = await client.query<{ database: string; role: string }>(
			"SELECT current_database() AS database, current_user AS role",
		);
		if (
			identity.rows[0]?.database !== "postgres" ||
			identity.rows[0]?.role !== target.role
		)
			throw new MigrationError("CONNECTED_DATABASE_IDENTITY_MISMATCH");
		const table = await client.query<{ present: boolean; named: boolean }>(
			"SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present, EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('drizzle.__drizzle_migrations') AND attname='name' AND NOT attisdropped) AS named",
		);
		const meta = table.rows[0];
		if (!meta) throw new MigrationError("MIGRATION_HISTORY_UNREADABLE");
		const rows = meta.present
			? (
					await client.query<{ hash: string; name?: string | null }>(
						meta.named
							? "SELECT hash,name FROM drizzle.__drizzle_migrations ORDER BY id"
							: "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
					)
				).rows
			: [];
		if (!rows.length) {
			// Managed Supabase schemas and extension members are not RESORA objects.
			const state = await client.query<{ populated: boolean }>(
				`SELECT EXISTS (
			 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
			 WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','v','m','f','S')
				 AND NOT ($1::boolean AND n.nspname='drizzle' AND c.relname IN ('__drizzle_migrations','__drizzle_migrations_id_seq'))
			 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
			 UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
			 WHERE n.nspname IN ('public','drizzle') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
			 UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
			 WHERE n.nspname IN ('public','drizzle') AND t.typtype IN ('e','d') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')
				) AS populated`,
				[meta.present],
			);
			if (state.rows[0]?.populated !== false)
				throw new MigrationError(
					"APPLICATION_SCHEMA_WITHOUT_MIGRATION_HISTORY",
				);
		}
		return pendingMigrations(local, rows, meta.named);
	} finally {
		await client.query("ROLLBACK");
	}
}

export function migrationChild(
	root: string,
	target: MigrationTarget,
	local: LocalMigrations,
	confirm?: string,
) {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		const normalized = key.toUpperCase(); // Windows environment keys are case-insensitive.
		if (
			normalized.startsWith("PG") ||
			normalized.startsWith("RESORA_DB_MIGRATION_") ||
			[
				"NODE_OPTIONS",
				"NODE_EXTRA_CA_CERTS",
				"NODE_TLS_REJECT_UNAUTHORIZED",
				"__VARLOCK_ENV",
				"DATABASE_URL",
				"DIRECT_DB_URL",
			].includes(normalized)
		)
			delete env[key];
	}
	env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
	env.RESORA_DB_MIGRATION_TARGET = target.target;
	env.RESORA_DB_MIGRATION_CONFIRM = confirm ?? "";
	env.RESORA_DB_MIGRATION_FINGERPRINT = migrationFingerprint(target, local);
	const kit = resolve(
		dirname(createRequire(import.meta.url).resolve("drizzle-kit/package.json")),
		"bin.cjs",
	);
	const node = Bun.which("node");
	if (!node) throw new MigrationError("NODE_RUNTIME_REQUIRED");
	return {
		command: [node, kit, "migrate", "--config", "scripts/migration.config.ts"],
		options: {
			cwd: resolve(root, "packages/db"),
			env,
			stdin: "ignore" as const,
			stdout: "ignore" as const,
			stderr: "ignore" as const,
		},
	};
}

export async function runMigrations(
	args: string[],
	root: string,
	dependencies = {
		load: loadMigrationTarget,
		local: localMigrations,
		connect: async (target: MigrationTarget) => {
			const pool = new Pool({ ...target.credentials, max: 1 });
			try {
				const client = await pool.connect();
				return {
					client,
					close: async () => {
						client.release();
						await pool.end();
					},
				};
			} catch (error) {
				await pool.end();
				throw error;
			}
		},
		preflight: migrationPreflight,
		execute: async (
			target: MigrationTarget,
			local: LocalMigrations,
			confirm?: string,
		) => {
			const child = migrationChild(root, target, local, confirm);
			// Never forward Kit's output: SQL errors may include credentials/data.
			return Bun.spawn(child.command, child.options).exited;
		},
		log: (message: string) => console.info(message),
	},
) {
	const selected = parseMigrationArgs(args);
	if (
		Object.entries(process.env).some(
			([key, value]) =>
				key.toUpperCase() === "NODE_TLS_REJECT_UNAUTHORIZED" && value === "0",
		)
	)
		throw new MigrationError("INSECURE_PROCESS_TLS_REJECTED");
	const target = dependencies.load(root, selected.target);
	approveMigration(selected, target);
	const local = dependencies.local(root);
	const connection = await dependencies.connect(target);
	let pending: LocalMigrations;
	try {
		pending = await dependencies.preflight(connection.client, target, local);
	} finally {
		// Release the Session Pooler slot before Kit opens its own connection.
		await connection.close();
	}
	dependencies.log(
		`Environment: ${selected.target.toUpperCase()}; project: ${target.reference}; mode: ${target.mode}`,
	);
	dependencies.log(
		`Pending migrations: ${pending.length}${pending.length ? ` (${pending.map((migration) => migration.name).join(", ")})` : ""}`,
	);
	dependencies.log("Preflight: PASS");
	if (!selected.apply) return;
	if (
		pending.length &&
		(await dependencies.execute(target, local, selected.confirm)) !== 0
	)
		throw new MigrationError(
			"DRIZZLE_MIGRATION_FAILED_STOP_VERIFY_HISTORY_NO_RETRY",
		);
	const verification = await dependencies.connect(target);
	try {
		if (
			(await dependencies.preflight(verification.client, target, local)).length
		)
			throw new MigrationError("POST_MIGRATION_HISTORY_INCOMPLETE");
		dependencies.log("Migration: PASS");
	} finally {
		await verification.close();
	}
}

export function migrationFailure(error: unknown): string {
	if (error instanceof MigrationError) return error.code;
	const current = error as { code?: unknown; cause?: unknown } | null;
	const code = current?.code;
	if (
		typeof code === "string" &&
		(/^(?:[0-9][0-9A-Z]|F0|HV|P0|XX)[0-9A-Z]{3}$/.test(code) ||
			[
				"ENOTFOUND",
				"EAI_AGAIN",
				"ENETUNREACH",
				"EHOSTUNREACH",
				"ECONNREFUSED",
				"ETIMEDOUT",
				"SELF_SIGNED_CERT_IN_CHAIN",
				"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
				"ERR_TLS_CERT_ALTNAME_INVALID",
				"CERT_HAS_EXPIRED",
			].includes(code))
	)
		return `MIGRATION_CONNECTION_OR_DATABASE_FAILURE_${code}`;
	return current?.cause
		? migrationFailure(current.cause)
		: "MIGRATION_FAILED_CHECK_PRIVATE_CONFIG_TLS_PERMISSIONS_AND_HISTORY";
}
if (import.meta.main) {
	try {
		await runMigrations(
			process.argv.slice(2),
			fileURLToPath(new URL("../../../", import.meta.url)),
		);
	} catch (error) {
		console.error(migrationFailure(error));
		process.exitCode = 1;
	}
}
