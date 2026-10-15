import {
	createHash,
	createHmac,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import {
	chmodSync,
	closeSync,
	createReadStream,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { devNull } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
	countsSql,
	fenceSql,
	fingerprintSql,
	functions,
	identifier,
	integritySql,
	inventorySql,
	literal,
	qualified,
	restoreLock,
	tables,
} from "./standby-sql";

class StandbyError extends Error {}
function fail(code: string): never {
	throw new StandbyError(code);
}
const connectionSchema = z
	.object({ url: z.string(), caFile: z.string().optional() })
	.strict();
const configSchema = z
	.object({
		source: connectionSchema,
		standby: connectionSchema.extend({
			mode: z.enum(["local-test", "supabase"]),
			purpose: z.literal("dedicated-non-production-standby"),
			projectRef: z
				.string()
				.regex(/^[a-z]{20}$/)
				.optional(),
			appRole: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
		}),
		directory: z.string(),
		keyFile: z.string(),
	})
	.strict();
export type StandbyConfig = z.infer<typeof configSchema>;
type Row = { name: string; count: string; digest: string };
type Summary = { fingerprint: string; rows: Row[] };
type Manifest = Summary & {
	id: string;
	archiveHash: string;
	migrations: string[];
	version: 17;
};
type Journal = {
	status: "running" | "verified" | "rolled-back" | "unknown";
	candidate: string;
	before: Summary | null;
};
const root = fileURLToPath(new URL("../../../", import.meta.url));
const migrations = () =>
	readMigrationFiles({
		migrationsFolder: join(root, "packages/db/src/migrations"),
	}).map((m) => m.hash);
const same = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);
const hash = (value: string | Uint8Array) =>
	createHash("sha256").update(value).digest("hex");
const loopback = (host: string) =>
	["localhost", "127.0.0.1", "[::1]"].includes(host);

export function validateConfig(input: unknown): StandbyConfig {
	const config = configSchema.parse(input);
	if (
		![
			config.directory,
			config.keyFile,
			config.source.caFile,
			config.standby.caFile,
		]
			.filter((path): path is string => path !== undefined)
			.every(isAbsolute)
	)
		fail("ABSOLUTE_OPERATIONAL_PATHS_REQUIRED");
	const source = parseConnection(config.source);
	const target = parseConnection(config.standby);
	if (!(loopback(source.hostname) || source.hostname === "postgres"))
		fail("SOURCE_MUST_BE_EXPLICIT_DOCKER_OR_LOOPBACK");
	if (source.host === target.host && source.pathname === target.pathname)
		fail("SOURCE_EQUALS_STANDBY");
	if (config.standby.mode === "local-test") {
		if (
			!loopback(source.hostname) ||
			!loopback(target.hostname) ||
			!/^\/resora_identity_test_[a-z0-9_]+$/.test(source.pathname) ||
			!/^\/resora_standby_test_[a-z0-9_]+$/.test(target.pathname)
		)
			fail("LOCAL_SCRATCH_TARGET_REQUIRED");
	} else {
		const ref = config.standby.projectRef;
		const direct = target.hostname === `db.${ref}.supabase.co`;
		const session =
			/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(target.hostname) &&
			decodeURIComponent(target.username).endsWith(`.${ref}`);
		if (
			!ref ||
			!(direct || session) ||
			target.pathname !== "/postgres" ||
			(target.port && target.port !== "5432") ||
			!config.standby.caFile
		)
			fail("VERIFIED_SUPABASE_DIRECT_OR_SESSION_TARGET_REQUIRED");
	}
	return config;
}

function parseConnection(connection: { url: string }) {
	const url = new URL(connection.url);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.search ||
		url.hash ||
		!url.username ||
		!url.password ||
		!/^\/[a-zA-Z0-9_]+$/.test(url.pathname)
	)
		fail("EXPLICIT_DATABASE_CREDENTIALS_REQUIRED_NO_URL_OPTIONS");
	return url;
}

function pool(connection: { url: string; caFile?: string }) {
	return new Pool({
		connectionString: connection.url,
		ssl: connection.caFile
			? {
					ca: readFileSync(connection.caFile, "utf8"),
					rejectUnauthorized: true,
				}
			: false,
		max: 1,
		connectionTimeoutMillis: 10_000,
		query_timeout: 30_000,
		options: "-c timezone=UTC",
		application_name: "resora-standby-preflight",
	});
}

function privateDirectory(path: string) {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
		fail("PRIVATE_SNAPSHOT_DIRECTORY_REQUIRED");
}
function privateFile(path: string) {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
		fail("PRIVATE_REGULAR_SECRET_FILE_REQUIRED");
	return readFileSync(path);
}
async function fileHash(path: string) {
	const digest = createHash("sha256");
	for await (const chunk of createReadStream(path)) digest.update(chunk);
	return digest.digest("hex");
}
function save(path: string, value: unknown, key: Buffer) {
	const payload = JSON.stringify(value);
	const signature = createHmac("sha256", key).update(payload).digest("hex");
	const temp = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temp, JSON.stringify({ payload, signature }), {
		mode: 0o600,
		flag: "wx",
	});
	sync(temp);
	renameSync(temp, path);
	sync(dirname(path));
}
function sync(path: string) {
	const descriptor = openSync(path, "r");
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}
function load<T>(path: string, key: Buffer): T {
	const envelope = JSON.parse(readFileSync(path, "utf8"));
	const actual = createHmac("sha256", key).update(envelope.payload).digest();
	const expected = Buffer.from(envelope.signature, "hex");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
		fail("SIGNATURE_MISMATCH");
	return JSON.parse(envelope.payload) as T;
}
function context(config: StandbyConfig) {
	const directory = resolve(config.directory);
	privateDirectory(directory);
	const key = privateFile(config.keyFile);
	if (key.length < 32) fail("AUTHENTICATION_KEY_TOO_SHORT");
	const url = parseConnection(config.standby);
	const target = hash(
		`${url.host}${url.pathname}:${config.standby.projectRef ?? "local"}:${config.standby.appRole}`,
	).slice(0, 24);
	return { directory, key, journal: join(directory, `standby-${target}.json`) };
}

function runnerLock(journal: string) {
	const path = `${journal}.lock`;
	try {
		mkdirSync(path, { mode: 0o700 });
	} catch {
		fail("RESTORE_RUNNER_LOCKED_RECONCILE_IF_INTERRUPTED");
	}
	try {
		writeFileSync(join(path, "owner"), String(process.pid), {
			mode: 0o600,
			flag: "wx",
		});
	} catch (error) {
		rmSync(path, { recursive: true });
		throw error;
	}
	return () => rmSync(path, { recursive: true });
}

function interruptedRunner(journal: string) {
	const path = `${journal}.lock`;
	if (!existsSync(path)) return false;
	const pid = Number(readFileSync(join(path, "owner"), "utf8"));
	if (!Number.isInteger(pid) || pid < 2)
		fail("INVALID_RUNNER_LOCK_REVIEW_REQUIRED");
	if (pid === process.pid) return false;
	try {
		process.kill(pid, 0);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
		fail("RUNNER_LOCK_STATUS_UNKNOWN");
	}
	fail("RESTORE_RUNNER_STILL_ACTIVE");
}

function utilityEnvironment(connection: { url: string; caFile?: string }) {
	const url = parseConnection(connection);
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.startsWith("PG")),
	);
	return {
		...env,
		PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
		PGPORT: url.port || "5432",
		PGDATABASE: url.pathname.slice(1),
		PGUSER: decodeURIComponent(url.username),
		PGPASSWORD: decodeURIComponent(url.password),
		PGSSLMODE: connection.caFile ? "verify-full" : "disable",
		...(connection.caFile ? { PGSSLROOTCERT: resolve(connection.caFile) } : {}),
		PGCONNECT_TIMEOUT: "10",
		PGAPPNAME: "resora-standby-restore",
		PGTZ: "UTC",
	};
}
async function native(
	tool: string,
	args: string[],
	connection: { url: string; caFile?: string },
) {
	const options = args[0] === "--version" ? args : ["--no-password", ...args];
	const child = Bun.spawn([tool, ...options], {
		env: utilityEnvironment(connection),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0) {
		const reason =
			stderr.match(/\bSTANDBY_[A-Z_]+\b/)?.[0] ??
			stderr.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5}):/)?.[1] ??
			"UTILITY_ERROR";
		fail(`${tool.toUpperCase()}_FAILED_EXIT_${code}_${reason}`);
	}
	return stdout;
}
async function tools(config: StandbyConfig) {
	for (const tool of ["pg_dump", "pg_restore", "psql"]) {
		const version = await native(tool, ["--version"], config.source);
		if (!/\(PostgreSQL\) 17\./.test(version))
			fail("POSTGRESQL_17_CLIENT_TOOLS_REQUIRED");
	}
}

async function checkIdentity(client: PoolClient, connection: { url: string }) {
	const row = (
		await client.query(
			"SELECT current_database() AS name, current_setting('server_version_num')::int AS version",
		)
	).rows[0];
	if (
		row.name !== parseConnection(connection).pathname.slice(1) ||
		row.version < 170000 ||
		row.version >= 180000
	)
		fail("DATABASE_IDENTITY_OR_VERSION_MISMATCH");
}
async function checkScope(client: PoolClient, allowEmpty = false) {
	const objects = (await client.query(inventorySql)).rows
		.map((r) => r.name)
		.sort();
	const actualFunctions = (
		await client.query(
			"SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','drizzle') ORDER BY 1",
		)
	).rows.map((r) => r.name);
	const types = (
		await client.query(
			"SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','drizzle') AND t.typtype IN ('e','d') ORDER BY 1",
		)
	).rows.map((r) => r.name);
	if (
		allowEmpty &&
		objects.length === 0 &&
		actualFunctions.length === 0 &&
		types.length === 0
	)
		return false;
	if (!same(objects, [...tables, "drizzle.__drizzle_migrations_id_seq"].sort()))
		fail("UNEXPECTED_APPLICATION_OBJECT_SCOPE");
	if (!same(actualFunctions, functions)) fail("UNEXPECTED_FUNCTION_SCOPE");
	if (!same(types, ["actor_type", "system_privilege"]))
		fail("UNEXPECTED_TYPE_SCOPE");
	const history = (
		await client.query(
			"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
		)
	).rows.map((r) => r.hash);
	if (!same(history, migrations())) fail("MIGRATION_HISTORY_MISMATCH");
	return true;
}
async function summary(client: PoolClient): Promise<Summary> {
	await client.query(
		"SET LOCAL search_path=pg_catalog,public; SET LOCAL TIME ZONE 'UTC'",
	);
	return {
		fingerprint: (await client.query(fingerprintSql)).rows[0].fingerprint,
		rows: (await client.query(countsSql)).rows,
	};
}

export function selectToc(list: string) {
	const selected: string[] = [];
	for (const line of list.split(/\r?\n/)) {
		if (!line || line.startsWith(";")) continue;
		const entry = /^\d+; \d+ \d+ (.+)$/.exec(line)?.[1];
		if (!entry) fail("INVALID_ARCHIVE_TOC");
		if (/^(SCHEMA|COMMENT|ACL|DEFAULT ACL) /.test(entry)) continue;
		if (
			!/^(TABLE DATA|SEQUENCE OWNED BY|SEQUENCE SET|FK CONSTRAINT|CONSTRAINT|DEFAULT|TABLE|SEQUENCE|INDEX|FUNCTION|TRIGGER|TYPE) (public|drizzle) /.test(
				entry,
			)
		)
			fail("ARCHIVE_CONTAINS_UNSUPPORTED_OBJECT");
		selected.push(line);
	}
	if (
		!selected.some((line) =>
			line.includes("TABLE DATA drizzle __drizzle_migrations "),
		)
	)
		fail("ARCHIVE_MIGRATION_DATA_REQUIRED");
	return `${selected.join("\n")}\n`;
}
function snapshotPath(directory: string, id: string) {
	if (!/^\d{13}-[a-f0-9-]{36}$/.test(id)) fail("INVALID_SNAPSHOT_ID");
	return join(directory, id);
}
async function archive(config: StandbyConfig, id: string) {
	const { directory, key } = context(config);
	const path = snapshotPath(directory, id);
	const manifest = load<Manifest>(`${path}.json`, key);
	if (
		manifest.id !== id ||
		manifest.version !== 17 ||
		!same(manifest.migrations, migrations()) ||
		!same(
			manifest.rows.map((r) => r.name),
			tables,
		) ||
		(await fileHash(`${path}.dump`)) !== manifest.archiveHash
	)
		fail("SNAPSHOT_VERIFICATION_FAILED");
	const toc = selectToc(
		await native("pg_restore", ["--list", `${path}.dump`], config.source),
	);
	await native(
		"pg_restore",
		[`--file=${devNull}`, `${path}.dump`],
		config.source,
	);
	return { path, manifest, toc };
}

export async function backup(config: StandbyConfig) {
	await tools(config);
	const { directory, key } = context(config);
	const id = `${Date.now()}-${randomUUID()}`;
	const path = snapshotPath(directory, id);
	const db = pool(config.source);
	const client = await db.connect();
	try {
		await checkIdentity(client, config.source);
		await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
		await checkScope(client);
		await client.query(integritySql);
		const data = await summary(client);
		const exported = (
			await client.query("SELECT pg_export_snapshot() AS snapshot")
		).rows[0].snapshot;
		writeFileSync(`${path}.dump`, "", { mode: 0o600, flag: "wx" });
		await native(
			"pg_dump",
			[
				"--format=custom",
				"--schema=public",
				"--schema=drizzle",
				"--no-owner",
				"--no-acl",
				"--no-publications",
				"--no-subscriptions",
				"--strict-names",
				"--lock-wait-timeout=10s",
				`--snapshot=${exported}`,
				`--file=${path}.dump`,
			],
			config.source,
		);
		selectToc(
			await native("pg_restore", ["--list", `${path}.dump`], config.source),
		);
		await native(
			"pg_restore",
			[`--file=${devNull}`, `${path}.dump`],
			config.source,
		);
		const manifest: Manifest = {
			...data,
			id,
			archiveHash: await fileHash(`${path}.dump`),
			migrations: migrations(),
			version: 17,
		};
		sync(`${path}.dump`);
		await client.query("COMMIT");
		save(`${path}.json`, manifest, key);
		return id;
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		rmSync(`${path}.dump`, { force: true });
		throw error;
	} finally {
		client.release();
		await db.end();
	}
}

function assertions(manifest: Manifest) {
	return `${integritySql};\nDO $$ BEGIN
 IF (${fingerprintSql}) <> ${literal(manifest.fingerprint)} THEN RAISE EXCEPTION 'STANDBY_SCHEMA_MISMATCH'; END IF;
 ${manifest.rows
		.map(
			(
				row,
			) => `IF (SELECT count(*) FROM ${qualified(row.name)}) <> ${literal(row.count)}::bigint OR
 (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) FROM ${qualified(row.name)} t) <> ${literal(row.digest)} THEN RAISE EXCEPTION 'STANDBY_DATA_MISMATCH'; END IF;`,
		)
		.join("\n")}
 END $$; SET CONSTRAINTS ALL IMMEDIATE;`;
}

async function inspectStandby(config: StandbyConfig): Promise<Summary | null> {
	const db = pool(config.standby);
	const client = await db.connect();
	try {
		await checkIdentity(client, config.standby);
		await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
		const lock = (
			await client.query(
				`SELECT pg_try_advisory_xact_lock(${restoreLock}) AS acquired`,
			)
		).rows[0];
		if (!lock.acquired) fail("RESTORE_STILL_RUNNING");
		await client.query(fenceSql(config.standby.appRole));
		const complete = await checkScope(client, true);
		if (complete) await client.query(integritySql);
		return complete ? await summary(client) : null;
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
		await db.end();
	}
}

export async function reconcile(config: StandbyConfig) {
	const { journal, key } = context(config);
	const stale = interruptedRunner(journal);
	const state = load<Journal>(journal, key);
	const { manifest } = await archive(config, state.candidate);
	const actual = await inspectStandby(config);
	const candidate = { fingerprint: manifest.fingerprint, rows: manifest.rows };
	const status = same(actual, candidate)
		? "verified"
		: same(actual, state.before)
			? "rolled-back"
			: "unknown";
	save(journal, { ...state, status }, key);
	if (status === "unknown") fail("STANDBY_RECOVERY_REQUIRED");
	if (stale) rmSync(`${journal}.lock`, { recursive: true });
	return status;
}

export async function restore(config: StandbyConfig, id: string) {
	const { journal } = context(config);
	const release = runnerLock(journal);
	try {
		return await restoreLocked(config, id);
	} finally {
		release();
	}
}

async function restoreLocked(config: StandbyConfig, id: string) {
	await tools(config);
	const { journal, directory, key } = context(config);
	if (existsSync(journal)) {
		const state = load<Journal>(journal, key);
		if (["running", "unknown"].includes(state.status))
			fail("RECONCILE_PREVIOUS_RESTORE_FIRST");
	}
	const { path, manifest, toc } = await archive(config, id);
	const before = await inspectStandby(config);
	const temp = mkdtempSync(join(directory, ".restore-"));
	chmodSync(temp, 0o700);
	const file = (name: string, value: string) => {
		const target = join(temp, name);
		writeFileSync(target, value, { mode: 0o600 });
		return target;
	};
	try {
		const tocPath = file("objects.list", toc);
		const sqlPath = file("restore.sql", "");
		await native(
			"pg_restore",
			[
				"--clean",
				"--if-exists",
				"--no-owner",
				"--no-acl",
				`--use-list=${tocPath}`,
				`--file=${sqlPath}`,
				`${path}.dump`,
			],
			config.source,
		);
		const database = parseConnection(config.standby).pathname.slice(1);
		const preflight = file(
			"preflight.sql",
			`SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='10min'; SET LOCAL idle_in_transaction_session_timeout='60s';
 DO $$ BEGIN IF current_database()<>${literal(database)} OR current_setting('server_version_num')::int/10000<>17 THEN RAISE EXCEPTION 'STANDBY_IDENTITY_MISMATCH'; END IF;
 IF NOT pg_try_advisory_xact_lock(${restoreLock}) THEN RAISE EXCEPTION 'STANDBY_RESTORE_BUSY'; END IF; END $$;
 ${fenceSql(config.standby.appRole)};
 CREATE SCHEMA IF NOT EXISTS drizzle;
 DO $$ DECLARE r record; BEGIN FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind='r' ORDER BY n.nspname,c.relname LOOP
 EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',r.nspname,r.relname); END LOOP; END $$;`,
		);
		const role = identifier(config.standby.appRole);
		const protection = tables
			.map(
				(table) =>
					`REVOKE ALL ON TABLE ${qualified(table)} FROM PUBLIC; GRANT ${table.startsWith("drizzle.") ? "SELECT" : "SELECT,INSERT,UPDATE,DELETE"} ON TABLE ${qualified(table)} TO ${role};`,
			)
			.join("\n");
		const revokeApi = ["PUBLIC", "anon", "authenticated", "service_role"]
			.map((apiRole) => {
				const revoke = [
					...tables.map(
						(table) =>
							`REVOKE ALL ON TABLE ${qualified(table)} FROM ${identifier(apiRole)}`,
					),
					...functions.map(
						(name) =>
							`REVOKE ALL ON FUNCTION public.${identifier(name)}() FROM ${identifier(apiRole)}`,
					),
					`REVOKE ALL ON SEQUENCE drizzle.__drizzle_migrations_id_seq FROM ${identifier(apiRole)}`,
				];
				if (apiRole === "PUBLIC")
					return [
						...tables.map(
							(table) => `REVOKE ALL ON TABLE ${qualified(table)} FROM PUBLIC;`,
						),
						...functions.map(
							(name) =>
								`REVOKE ALL ON FUNCTION public.${identifier(name)}() FROM PUBLIC;`,
						),
					].join("\n");
				return `DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(apiRole)}) THEN ${revoke.map((sql) => `EXECUTE ${literal(sql)};`).join(" ")} END IF; END $$;`;
			})
			.join("\n");
		const validation = file(
			"validate.sql",
			`SET LOCAL search_path=pg_catalog,public; SET LOCAL TIME ZONE 'UTC';
 ${revokeApi}
 ${protection}
 GRANT USAGE ON SCHEMA public,drizzle TO ${role};
 REVOKE ALL ON SEQUENCE drizzle.__drizzle_migrations_id_seq FROM PUBLIC;
 GRANT USAGE,SELECT ON SEQUENCE drizzle.__drizzle_migrations_id_seq TO ${role};
 ${fenceSql(config.standby.appRole)};
 ${assertions(manifest)}`,
		);
		save(
			journal,
			{ status: "running", before, candidate: id } satisfies Journal,
			key,
		);
		let nativeFailure: string | null = null;
		try {
			await native(
				"psql",
				[
					"-X",
					"--single-transaction",
					"--set=ON_ERROR_STOP=on",
					"--set=VERBOSITY=verbose",
					`--file=${preflight}`,
					`--file=${sqlPath}`,
					`--file=${validation}`,
				],
				config.standby,
			);
		} catch (error) {
			nativeFailure =
				error instanceof StandbyError ? error.message : "PSQL_EXECUTION_FAILED";
		}
		const status = await reconcile(config);
		if (status !== "verified" || nativeFailure)
			fail(
				`${status === "rolled-back" ? "RESTORE_FAILED_PREVIOUS_DATA_PRESERVED" : "RESTORE_DATA_VERIFIED_BUT_CLIENT_FAILED"}_${nativeFailure ?? "VALIDATION_FAILED"}`,
			);
		return status;
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const [command, configPath, value] = process.argv.slice(2);
	try {
		if (
			!configPath ||
			!["backup", "verify", "restore", "reconcile"].includes(command ?? "")
		)
			fail("USAGE_COMMAND_CONFIG_SNAPSHOT_OR_CONFIRMATION_REQUIRED");
		const config = validateConfig(
			JSON.parse(privateFile(resolve(configPath)).toString("utf8")),
		);
		if (command === "backup") {
			const id = await backup(config);
			console.log(
				JSON.stringify({
					operation: command,
					status: "verified",
					snapshot: id,
				}),
			);
		} else if (command === "verify") {
			await archive(config, value ?? "");
			console.log(
				JSON.stringify({
					operation: command,
					status: "archive-verified",
					snapshot: value,
				}),
			);
		} else {
			const expected =
				config.standby.mode === "supabase"
					? config.standby.projectRef
					: parseConnection(config.standby).pathname.slice(1);
			if (process.env.RESORA_STANDBY_CONFIRM !== expected)
				fail("EXPLICIT_STANDBY_CONFIRMATION_REQUIRED");
			const status =
				command === "restore"
					? await restore(config, value ?? "")
					: await reconcile(config);
			console.log(JSON.stringify({ operation: command, status }));
		}
	} catch (error) {
		console.error(
			JSON.stringify({
				operation: command ?? "unknown",
				status: "failed",
				code:
					error instanceof StandbyError
						? error.message
						: "CONFIGURATION_IO_OR_DATABASE_FAILURE",
			}),
		);
		process.exitCode = 1;
	}
}
