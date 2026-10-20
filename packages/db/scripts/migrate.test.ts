import { afterAll, expect, test } from "bun:test";
import { X509Certificate } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	rmdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates, TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import {
	migrationChild,
	migrationFailure,
	migrationPreflight,
	runMigrations,
	verifiedMigrationTls,
} from "./migrate";
import {
	approveMigration,
	type LocalMigrations,
	loadMigrationTarget,
	migrationFingerprint,
	parseMigrationArgs,
	parseMigrationFile,
	pendingMigrations,
	validateMigrationTarget,
} from "./migration-target";

const ref = "abcdefghijklmnopqrst";
const prodRef = "bcdefghijklmnopqrstu";
const secret = "synthetic-migration-p@ss:/?#%+ $'\"";
const ca =
	rootCertificates.find((pem) => {
		const cert = new X509Certificate(pem);
		return (
			cert.ca &&
			Date.parse(cert.validFrom) < Date.now() &&
			Date.parse(cert.validTo) > Date.now()
		);
	}) ?? "";
const roots: string[] = [];
const local: LocalMigrations = [
	{
		name: "20261001000000_first",
		hash: "a".repeat(64),
		folderMillis: 1790812800000,
		sql: ["synthetic"],
		bps: true,
	},
	{
		name: "20261002000000_second",
		hash: "b".repeat(64),
		folderMillis: 1790899200000,
		sql: ["synthetic"],
		bps: true,
	},
];
function content(reference = ref, mode = "session") {
	const host =
		mode === "direct"
			? `db.${reference}.supabase.co`
			: "aws-0-ap-northeast-1.pooler.supabase.com";
	const user = mode === "direct" ? "postgres" : `postgres.${reference}`;
	return `DB_MIGRATION_URL='postgresql://${user}:${encodeURIComponent(secret).replace(/'/g, "%27")}@${host}:5432/postgres'\nDB_PROJECT_REF=${reference}\nDB_CONNECTION_MODE=${mode}\nDB_CA_FILE=supabase-ca.pem\n`;
}
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "resora-migration-cli-"));
	roots.push(root);
	const directory = join(root, ".private/db-migration");
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "dev.env"), content());
	await writeFile(join(directory, "prod.env"), content(prodRef, "direct"));
	await writeFile(join(directory, "supabase-ca.pem"), ca);
	return { root, directory };
}
afterAll(async () => {
	for (const root of roots) {
		const directory = join(root, ".private/db-migration");
		for (const file of ["dev.env", "prod.env", "supabase-ca.pem"])
			await unlink(join(directory, file)).catch(() => {});
		await rmdir(directory);
		await rmdir(join(root, ".private"));
		await rmdir(root);
	}
});

test("explicit dev/prod CLI grammar, default dev apply, default Production refusal", () => {
	expect(parseMigrationArgs(["dev"])).toMatchObject({
		target: "dev",
		apply: true,
	});
	expect(parseMigrationArgs(["dev", "--check"]).apply).toBe(false);
	expect(parseMigrationArgs(["prod", "--check"]).apply).toBe(false);
	expect(
		parseMigrationArgs(["prod", "--apply", "--confirm", prodRef]).apply,
	).toBe(true);
	for (const args of [
		[],
		["staging"],
		["prod"],
		["prod", "--apply"],
		["dev", "--apply"],
		["dev", "--check", "--apply"],
		["dev", "--check", "--check"],
		["prod", "--check", "--confirm", prodRef],
		["prod", "--apply", "--confirm"],
		["dev", "--unknown"],
		["dev", "--confirm", prodRef],
	])
		expect(() => parseMigrationArgs(args)).toThrow();
});

test("loads only the chosen private file, uses verified CA and decodes URL passwords exactly once", async () => {
	const f = await fixture();
	const dev = loadMigrationTarget(f.root, "dev");
	const prod = loadMigrationTarget(f.root, "prod");
	expect(dev.reference).toBe(ref);
	expect(prod.reference).toBe(prodRef);
	expect(dev.mode).toBe("session");
	expect(prod.mode).toBe("direct");
	expect(dev.credentials.password === secret).toBe(true);
	expect(dev.credentials.ssl.rejectUnauthorized).toBe(true);
	expect(dev.credentials.ssl.ca === ca).toBe(true);
	expect(dev.credentials.ssl.servername).toBe(dev.credentials.host);
	await unlink(join(f.directory, "prod.env"));
	expect(loadMigrationTarget(f.root, "dev").reference).toBe(ref);
	expect(() => loadMigrationTarget(f.root, "prod")).toThrow(
		"PRIVATE_TARGET_CONFIG_UNREADABLE",
	);
});

test("missing, malformed, duplicate, interpolated and unknown private settings fail closed", async () => {
	for (const invalid of [
		"",
		content().replace("DB_PROJECT_REF=", "UNKNOWN_KEY="),
		`${content()}DB_PROJECT_REF=${ref}\n`,
		`${content()}not-an-assignment`,
		content().replace("supabase-ca.pem", "\u0024{OTHER_CA}"),
		content().replace("DB_CA_FILE=supabase-ca.pem", 'DB_CA_FILE="unterminated'),
	])
		expect(() => parseMigrationFile(invalid)).toThrow();
	const f = await fixture();
	await writeFile(
		join(f.directory, "supabase-ca.pem"),
		"invalid-not-a-certificate",
	);
	expect(() => loadMigrationTarget(f.root, "dev")).toThrow(
		"CA_FILE_UNREADABLE_OR_INVALID",
	);
	await unlink(join(f.directory, "supabase-ca.pem"));
	expect(() => loadMigrationTarget(f.root, "dev")).toThrow(
		"CA_FILE_UNREADABLE_OR_INVALID",
	);
});

test("target validation rejects wrong project/mode, Transaction Pooler, URL TLS overrides and ambiguous URLs", () => {
	const valid = parseMigrationFile(content());
	for (const overrides of [
		{ DB_PROJECT_REF: prodRef },
		{ DB_CONNECTION_MODE: "transaction" },
		{ DB_CONNECTION_MODE: "direct" },
		{ DB_MIGRATION_URL: valid.DB_MIGRATION_URL.replace(":5432/", ":6543/") },
		{ DB_MIGRATION_URL: `${valid.DB_MIGRATION_URL}?sslmode=require` },
		{ DB_MIGRATION_URL: `${valid.DB_MIGRATION_URL}?host=attacker.invalid` },
		{ DB_MIGRATION_URL: `${valid.DB_MIGRATION_URL}#fragment` },
		{
			DB_MIGRATION_URL: valid.DB_MIGRATION_URL.replace(
				".pooler.supabase.com",
				".pooler.supabase.com.attacker.invalid",
			),
		},
		{ DB_MIGRATION_URL: `${valid.DB_MIGRATION_URL.slice(0, -9)}/wrong` },
	])
		expect(() => {
			validateMigrationTarget({ ...valid, ...overrides });
		}).toThrow();
});

function clientFixture(target: ReturnType<typeof loadMigrationTarget>) {
	const socket = Object.create(TLSSocket.prototype) as TLSSocket;
	Object.defineProperties(socket, {
		encrypted: { value: true, writable: true },
		authorized: { value: true, writable: true },
		destroyed: { value: false, writable: true },
		getProtocol: { value: () => "TLSv1.3", writable: true },
		getPeerCertificate: {
			value: () => ({ subjectaltname: `DNS:${target.credentials.host}` }),
			writable: true,
		},
	});
	const state = {
		applied: local.slice(0, 1).map(({ hash, name }) => ({ hash, name })),
		present: true,
		named: true,
		populated: false,
		role: target.role,
		queries: [] as string[],
	};
	const observed = {
		host: target.credentials.host,
		port: 5432,
		ssl: { ...target.credentials.ssl },
		connection: { stream: socket },
		query: async (text: string) => {
			state.queries.push(text);
			if (text.includes("current_database()"))
				return { rows: [{ database: "postgres", role: state.role }] };
			if (text.includes("SELECT to_regclass"))
				return { rows: [{ present: state.present, named: state.named }] };
			if (text.startsWith("SELECT hash")) return { rows: state.applied };
			if (text.includes("AS populated"))
				return { rows: [{ populated: state.populated }] };
			return { rows: [] };
		},
	};
	return { state, socket, observed, client: observed as unknown as PoolClient };
}

test("client TLS requires a live authorized chain/hostname for Direct and Session, not pooler-to-DB TLS", async () => {
	const f = await fixture();
	for (const name of ["dev", "prod"] as const) {
		const target = loadMigrationTarget(f.root, name);
		verifiedMigrationTls(clientFixture(target).client, target);
		for (const failure of [
			"authorized",
			"encrypted",
			"hostname",
			"host",
			"ca",
			"rejectUnauthorized",
			"destroyed",
			"protocol",
		]) {
			const c = clientFixture(target);
			if (failure === "authorized") c.socket.authorized = false;
			if (failure === "encrypted")
				Object.defineProperty(c.socket, "encrypted", { value: false });
			if (failure === "hostname")
				Object.defineProperty(c.socket, "getPeerCertificate", {
					value: () => ({ subjectaltname: "DNS:attacker.invalid" }),
				});
			if (failure === "host") c.observed.host = "attacker.invalid";
			if (failure === "ca") c.observed.ssl.ca = "different-ca";
			if (failure === "rejectUnauthorized")
				c.observed.ssl.rejectUnauthorized = false as never;
			if (failure === "destroyed")
				Object.defineProperty(c.socket, "destroyed", { value: true });
			if (failure === "protocol") c.socket.getProtocol = () => null;
			expect(() => verifiedMigrationTls(c.client, target)).toThrow(
				"VERIFIED_CLIENT_TLS_REQUIRED",
			);
		}
	}
});

test("applied history must be the exact hash/name prefix; pending files and legacy unnamed history are allowed", () => {
	expect(pendingMigrations(local, [], false)).toHaveLength(2);
	expect(
		pendingMigrations(local, [{ hash: local[0]?.hash ?? "" }], false),
	).toHaveLength(1);
	expect(
		pendingMigrations(
			local,
			local.map(({ hash, name }) => ({ hash, name })),
			true,
		),
	).toHaveLength(0);
	for (const applied of [
		[{ hash: "unexpected" }],
		[{ hash: local[1]?.hash ?? "" }],
		[...local, ...local],
	])
		expect(() => pendingMigrations(local, applied, false)).toThrow(
			"MIGRATION_HISTORY_DIVERGED",
		);
	expect(() =>
		pendingMigrations(
			local,
			[{ hash: local[0]?.hash ?? "", name: "wrong" }],
			true,
		),
	).toThrow();
});

test("read-only preflight accepts an empty application schema but rejects missing/empty history over existing objects", async () => {
	const f = await fixture();
	const target = loadMigrationTarget(f.root, "dev");
	for (const present of [true, false]) {
		const c = clientFixture(target);
		c.state.present = present;
		c.state.applied = [];
		expect(await migrationPreflight(c.client, target, local)).toHaveLength(2);
		expect(c.state.queries[0]).toBe("BEGIN READ ONLY");
		expect(c.state.queries.at(-1)).toBe("ROLLBACK");
		c.state.populated = true;
		await expect(migrationPreflight(c.client, target, local)).rejects.toThrow(
			"APPLICATION_SCHEMA_WITHOUT_MIGRATION_HISTORY",
		);
	}
	const c = clientFixture(target);
	c.state.role = "wrong_role";
	await expect(migrationPreflight(c.client, target, local)).rejects.toThrow(
		"CONNECTED_DATABASE_IDENTITY_MISMATCH",
	);
});

test("runner check never executes Kit; dev apply verifies final history and a failed Kit is not retried", async () => {
	const f = await fixture();
	const target = loadMigrationTarget(f.root, "dev");
	const c = clientFixture(target);
	let executions = 0;
	let closed = 0;
	let open = 0;
	const logs: string[] = [];
	const dependencies = {
		load: () => target,
		local: () => local,
		connect: async () => {
			open++;
			return {
				client: c.client,
				close: async () => {
					closed++;
					open--;
				},
			};
		},
		preflight: migrationPreflight,
		execute: async () => {
			expect(open).toBe(0);
			executions++;
			c.state.applied = local.map(({ hash, name }) => ({ hash, name }));
			return 0;
		},
		log: (message: string) => {
			logs.push(message);
		},
	};
	await runMigrations(["dev", "--check"], f.root, dependencies);
	expect(executions).toBe(0);
	expect(closed).toBe(1);
	await runMigrations(["dev"], f.root, dependencies);
	expect(executions).toBe(1);
	expect(closed).toBe(3);
	expect(logs.at(-1)).toBe("Migration: PASS");
	expect(logs.join(" ").includes(secret)).toBe(false);
	expect(logs.join(" ").includes("postgresql:")).toBe(false);
	c.state.applied = [];
	await expect(
		runMigrations(["dev"], f.root, {
			...dependencies,
			execute: async () => {
				executions++;
				return 1;
			},
		}),
	).rejects.toThrow("DRIZZLE_MIGRATION_FAILED_STOP_VERIFY_HISTORY_NO_RETRY");
	expect(executions).toBe(2);
});

test("Production confirmation is exact and rejects writes before connecting when absent/wrong", async () => {
	const f = await fixture();
	const target = loadMigrationTarget(f.root, "prod");
	expect(() =>
		approveMigration({ target: "prod", apply: true, confirm: ref }, target),
	).toThrow("PRODUCTION_CONFIRMATION_MISMATCH");
	approveMigration({ target: "prod", apply: true, confirm: prodRef }, target);
	let connected = false;
	let executed = false;
	const c = clientFixture(target);
	const dependencies = {
		load: () => target,
		local: () => local,
		connect: async () => {
			connected = true;
			return { client: c.client, close: async () => {} };
		},
		preflight: migrationPreflight,
		execute: async () => {
			executed = true;
			return 0;
		},
		log: () => {},
	};
	await expect(runMigrations(["prod"], f.root, dependencies)).rejects.toThrow();
	await expect(
		runMigrations(["prod", "--apply", "--confirm", ref], f.root, dependencies),
	).rejects.toThrow();
	expect(connected || executed).toBe(false);
	await runMigrations(["prod", "--check"], f.root, dependencies);
	expect(executed).toBe(false);
	await runMigrations(["prod", "--apply", "--confirm", prodRef], f.root, {
		...dependencies,
		execute: async () => {
			executed = true;
			c.state.applied = local.map(({ hash, name }) => ({ hash, name }));
			return 0;
		},
	});
	expect(executed).toBe(true);
});

test("a zero child exit without the expected applied history is never reported as migration success", async () => {
	const f = await fixture();
	const target = loadMigrationTarget(f.root, "dev");
	const c = clientFixture(target);
	const logs: string[] = [];
	await expect(
		runMigrations(["dev"], f.root, {
			load: () => target,
			local: () => local,
			connect: async () => ({ client: c.client, close: async () => {} }),
			preflight: migrationPreflight,
			execute: async () => 0,
			log: (message: string) => {
				logs.push(message);
			},
		}),
	).rejects.toThrow("POST_MIGRATION_HISTORY_INCOMPLETE");
	expect(logs.includes("Migration: PASS")).toBe(false);
});

test("Kit child uses explicit verified settings; no URL in argv, inherited PG/app/Node overrides removed", async () => {
	const f = await fixture();
	const target = loadMigrationTarget(f.root, "dev");
	const child = migrationChild(f.root, target, local);
	expect(child.command[2]).toBe("migrate");
	expect(child.command.includes("scripts/migration.config.ts")).toBe(true);
	expect(child.command.join(" ").includes(secret)).toBe(false);
	expect(child.options.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("1");
	for (const key of [
		"PGSSLMODE",
		"PGHOST",
		"PGOPTIONS",
		"DATABASE_URL",
		"DIRECT_DB_URL",
		"NODE_OPTIONS",
		"NODE_EXTRA_CA_CERTS",
		"__VARLOCK_ENV",
	])
		expect(key in child.options.env).toBe(false);
	expect(child.options.env.RESORA_DB_MIGRATION_FINGERPRINT).toBe(
		migrationFingerprint(target, local),
	);
	expect(
		migrationFingerprint(
			{
				...target,
				credentials: { ...target.credentials, password: "changed" },
			},
			local,
		) === migrationFingerprint(target, local),
	).toBe(false);
	const code = await readFile(
		new URL("migration.config.ts", import.meta.url),
		"utf8",
	);
	expect(code.includes("dbCredentials: target.credentials")).toBe(true);
	expect(code.includes("varlock/auto-load")).toBe(false);
});

test("installed Drizzle Kit loads the dedicated config and rejects invalid targets before connecting", async () => {
	const f = await fixture();
	const child = migrationChild(
		f.root,
		loadMigrationTarget(f.root, "dev"),
		local,
	);
	const root = new URL("../../../", import.meta.url);
	const process = Bun.spawn(child.command, {
		...child.options,
		cwd: fileURLToPath(new URL("packages/db/", root)),
		env: { ...child.options.env, RESORA_DB_MIGRATION_TARGET: "invalid" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	expect(code !== 0).toBe(true);
	expect(`${stdout}${stderr}`.includes("EXPLICIT_DEV_OR_PROD_REQUIRED")).toBe(
		true,
	);
}, 15_000);

test("case-variant inherited target settings cannot redirect the Windows/Linux child", async () => {
	const f = await fixture();
	const key = "resora_db_migration_target";
	const previous = process.env[key];
	try {
		process.env[key] = "stale-target";
		const child = migrationChild(
			f.root,
			loadMigrationTarget(f.root, "dev"),
			local,
		);
		expect(child.options.env.RESORA_DB_MIGRATION_TARGET).toBe("dev");
		expect(Object.hasOwn(child.options.env, key)).toBe(false);
	} finally {
		if (previous === undefined) delete process.env[key];
		else process.env[key] = previous;
	}
});

test("only fixed errors and safe driver codes reach diagnostics, never raw messages/stacks", () => {
	for (const code of [
		"ENOTFOUND",
		"ENETUNREACH",
		"28P01",
		"42501",
		"SELF_SIGNED_CERT_IN_CHAIN",
	]) {
		const message = migrationFailure(
			Object.assign(Error(`postgresql://private:${secret}@host/postgres`), {
				code,
			}),
		);
		expect(message.includes(code)).toBe(true);
		expect(message.includes(secret)).toBe(false);
		expect(message.includes("postgresql:")).toBe(false);
	}
	expect(migrationFailure(Error(secret)).includes(secret)).toBe(false);
});
