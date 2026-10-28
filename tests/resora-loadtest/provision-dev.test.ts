import { expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import {
	csvColumns,
	encodeCsv,
	ProvisioningError,
	readCsv,
} from "../../packages/api/src/modules/provisioning/provisioning-csv";
import {
	localProvisioningTarget,
	provisionSrAccounts,
} from "../../packages/api/src/modules/provisioning/sr-provisioning";
import { BootstrapError } from "../../packages/api/src/modules/provisioning/system-admin-bootstrap";
import type { Database } from "../../packages/db/src/index";
import { getPoolConfig } from "../../packages/db/src/pool-config";
import { account, user } from "../../packages/db/src/schema/auth";
import {
	buildings,
	departments,
	positions,
} from "../../packages/db/src/schema/identity";
import {
	developmentTarget,
	diagnosticMessage,
	inspectAccounts,
	parseArguments,
	prepareLoadtestCredentials,
	readRoster,
	run,
	validateAccountState,
	validateRoster,
	verifyDevelopmentDatabase,
} from "./provision-dev";

const dev = "abcdefghijklmnopqrst";
const prod = "bbbbbbbbbbbbbbbbbbbb";
const url = `postgresql://postgres.${dev}:synthetic-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
const csv = await readRoster();
const rows = validateRoster(csv);

test("installed pg parses DEV libpq require as encrypted TLS without certificate verification (no connect)", () => {
	const dbRequire = createRequire(
		new URL("../../packages/db/src/index.ts", import.meta.url),
	);
	const { Client } = dbRequire("pg") as {
		Client: new (
			config: ReturnType<typeof getPoolConfig>,
		) => {
			connectionParameters: { ssl: unknown; host: string; port: number };
		};
	};
	for (const input of [
		url,
		`${url}?sslmode=require&uselibpqcompat=true`,
		`postgresql://postgres:synthetic-secret@db.${dev}.supabase.co:5432/postgres`,
	]) {
		const target = developmentTarget(input, dev, prod, "check");
		const parameters = new URL(target.url).searchParams;
		expect(parameters.get("sslmode")).toBe("require");
		expect(parameters.get("uselibpqcompat")).toBe("true");
		expect([...parameters]).toHaveLength(2);
		const client = new Client(getPoolConfig({ DATABASE_URL: target.url }));
		expect(client.connectionParameters.ssl).toEqual({
			rejectUnauthorized: false,
		});
		expect(client.connectionParameters.ssl).not.toBe(false);
		expect(client.connectionParameters.host).toBe(new URL(target.url).hostname);
		expect(client.connectionParameters.port).toBe(5432);
	}
	expect(parseArguments(["--check"])).toEqual({
		mode: "check",
		confirmDev: undefined,
	});
	expect(parseArguments(["--dry-run"]).mode).toBe("dry-run");
	expect(
		getPoolConfig({ DATABASE_URL: url, DB_SSL_CA: "synthetic-ca" }).ssl,
	).toEqual({ ca: "synthetic-ca", rejectUnauthorized: true });
});

test("explicit DEV allowlist accepts Direct and Session Pooler only", () => {
	expect(developmentTarget(url, dev, prod, "dry-run").connectionMode).toBe(
		"SESSION_POOLER",
	);
	expect(
		developmentTarget(
			`postgresql://postgres:synthetic-secret@db.${dev}.supabase.co/postgres`,
			dev,
			prod,
			"check",
		).connectionMode,
	).toBe("DIRECT");
	for (const value of [
		undefined,
		"not-a-url",
		`postgresql://postgres:synthetic-secret@db.${prod}.supabase.co:5432/postgres`,
		url.replace(dev, prod),
		url.replace("5432", "6543"),
		url.replace("/postgres", "/other"),
		url.replace("pooler.supabase.com", "pooler.supabase.com.untrusted.invalid"),
		url.replace(`postgres.${dev}`, "postgres"),
		url.replace("postgresql:", "https:"),
		`${url}?host=db.${prod}.supabase.co`,
		`${url}?sslmode=disable`,
		`${url}?uselibpqcompat=false`,
		`${url}?sslrootcert=arbitrary.pem`,
		`${url}#fragment`,
		"postgresql://postgres:synthetic-secret@127.0.0.1:5432/postgres",
	])
		expect(() => developmentTarget(value, dev, prod, "dry-run")).toThrow();
	for (const [expected, known] of [
		[undefined, prod],
		[dev, undefined],
		[dev, dev],
		["bad", prod],
	])
		expect(() => developmentTarget(url, expected, known, "dry-run")).toThrow();
});

test("default is dry-run; apply requires a separate matching confirmation", () => {
	expect(parseArguments([]).mode).toBe("dry-run");
	for (const confirmation of [undefined, prod, "yes"])
		expect(() =>
			developmentTarget(url, dev, prod, "apply", confirmation),
		).toThrow("MATCHING_DEV_APPLY_CONFIRMATION_REQUIRED");
	expect(developmentTarget(url, dev, prod, "apply", dev).reference).toBe(dev);
	for (const args of [
		["--apply", "--verify"],
		["--input", "other.csv"],
		["--ca-file"],
		["--confirm-dev", "--apply"],
	])
		expect(() => parseArguments(args)).toThrow();
});

test("DEV preflight connects only to pinned DEV URL and checks SQL identity/schema/history/references read-only", async () => {
	const target = developmentTarget(url, dev, prod, "check");
	const migrationRoot = resolve(
		import.meta.dir,
		"../../packages/db/src/migrations",
	);
	const hashes = await Promise.all(
		(await readdir(migrationRoot))
			.filter((name) => /^\d{14}_/.test(name))
			.sort()
			.slice(0, 3)
			.map(async (folder) => ({
				hash: createHash("sha256")
					.update(
						await readFile(
							join(migrationRoot, folder, "migration.sql"),
							"utf8",
						),
					)
					.digest("hex"),
			})),
	);
	const connectionCodes: Record<string, string> = {
		"connect-dns": "ENOTFOUND",
		"connect-network": "ENETUNREACH",
		"connect-auth": "28P01",
		"connect-cert": "CERT_HAS_EXPIRED",
	};
	const stages: Record<string, string> = {
		role: "DB_IDENTITY",
		database: "DB_IDENTITY",
		tables: "SCHEMA",
		history: "MIGRATION_HISTORY",
		refs: "ORG_REFERENCES",
		"connect-dns": "CONNECTION",
		"connect-network": "CONNECTION",
		"connect-auth": "CONNECTION",
		"connect-cert": "TLS",
		"sql-identity": "DB_IDENTITY",
		"sql-schema": "SCHEMA",
		"sql-history": "MIGRATION_HISTORY",
		"sql-refs": "ORG_REFERENCES",
	};
	for (const failure of [
		"none",
		"role",
		"database",
		"tables",
		"history",
		"refs",
		"connect-dns",
		"connect-network",
		"connect-auth",
		"connect-cert",
		"sql-identity",
		"sql-schema",
		"sql-history",
		"sql-refs",
	]) {
		const sql: string[] = [];
		const db = {
			$client: {
				options: { connectionString: target.url },
				connect: async () => {
					const code = connectionCodes[failure];
					if (code) throw Object.assign(new Error(`private ${url}`), { code });
					return {
						release: () => {},
					};
				},
				query: async (query: string) => {
					sql.push(query);
					if (
						(failure === "sql-identity" &&
							query.includes("current_database")) ||
						(failure === "sql-schema" && query.includes("bool_and")) ||
						(failure === "sql-history" &&
							query.includes("__drizzle_migrations")) ||
						(failure === "sql-refs" && query.includes("FROM departments"))
					)
						throw new Error(`private SQL parameters ${url}`, {
							cause: Object.assign(new Error("private password cookie"), {
								code: "42501",
							}),
						});
					if (query.includes("current_database"))
						return {
							rows: [
								{
									name: failure === "database" ? "other" : "postgres",
									role: failure === "role" ? "other" : "postgres",
								},
							],
						};
					if (query.includes("bool_and"))
						return { rows: [{ ready: failure !== "tables" }] };
					if (query.includes("__drizzle_migrations"))
						return {
							rows:
								failure === "history"
									? hashes.map(() => ({ hash: "invalid" }))
									: hashes,
						};
					return { rows: [{ ready: failure !== "refs" }] };
				},
			},
		} as unknown as Database;
		if (failure === "none") await verifyDevelopmentDatabase(db, target);
		else {
			let diagnostic = "";
			try {
				await verifyDevelopmentDatabase(db, target);
			} catch (error) {
				if (error instanceof Error) error.message = `private ${url}`;
				diagnostic = diagnosticMessage(error);
			}
			expect(diagnostic).toContain(`stage=${stages[failure]}`);
			if (failure.startsWith("connect-")) {
				const code = connectionCodes[failure];
				expect(diagnostic).toContain(`code=${code}`);
			} else if (failure.startsWith("sql-"))
				expect(diagnostic).toContain("code=42501");
			else expect(diagnostic).toMatch(/code=(DEV_|ACTIVE_LOADTEST_)/);
			for (const sensitive of [
				url,
				"synthetic-secret",
				"private",
				"password",
				"cookie",
				"stack",
				"SELECT",
			])
				expect(diagnostic).not.toContain(sensitive);
		}
		if (failure.startsWith("connect-")) expect(sql).toHaveLength(0);
		for (const query of sql) expect(query).toMatch(/^SELECT /);
	}
});

test("mismatched pool URL is rejected before connecting", async () => {
	let connections = 0;
	const db = {
		$client: {
			options: { connectionString: url.replace(dev, prod) },
			connect: async () => {
				connections++;
				throw new Error("Unexpected connect");
			},
		},
	} as unknown as Database;
	await expect(
		verifyDevelopmentDatabase(db, developmentTarget(url, dev, prod, "check")),
	).rejects.toThrow("DEV_POOL_TARGET_MISMATCH");
	expect(connections).toBe(0);
});

test("diagnostics preserve known codes and suppress messages/stacks/arbitrary code values", () => {
	for (const error of [
		new ProvisioningError("EXISTING_ACCOUNT_CONFLICT", 2),
		new BootstrapError("PRODUCTION_TLS_REQUIRED"),
	]) {
		error.message = `private ${url}`;
		error.stack = "private stack";
		expect(diagnosticMessage(error)).toContain(`code=${error.code}`);
		expect(diagnosticMessage(error)).not.toContain("private");
	}
	for (const code of ["ENOTFOUND", "ENETUNREACH", "28P01", "42P01", "XX000"])
		expect(
			diagnosticMessage(Object.assign(new Error(`private ${url}`), { code })),
		).toBe(`DEV_LOADTEST_PREPARATION_FAILED code=${code}`);
	for (const code of [url, "arbitrary credential", "SECRET_TOKEN_VALUE"])
		expect(diagnosticMessage({ code, message: url, stack: url })).toBe(
			"DEV_LOADTEST_PREPARATION_FAILED code=UNKNOWN_ERROR",
		);
	const cyclic: { cause?: unknown; message: string } = { message: url };
	cyclic.cause = cyclic;
	expect(diagnosticMessage(cyclic)).toContain("UNKNOWN_ERROR");
});

test("CSV is exactly the approved 50 unique active RND/ANGGOTA/A identities", async () => {
	expect(rows).toHaveLength(50);
	expect(new Set(rows.map((row) => row.nim)).size).toBe(50);
	expect(new Set(rows.map((row) => row.email)).size).toBe(50);
	const records = readCsv(csv);
	for (const [field, value] of [
		[0, "real-user"],
		[1, "Other name"],
		[2, "real@example.com"],
		[3, "HCO"],
		[4, "KADEP"],
		[5, "B"],
		[6, "false"],
	] as const) {
		const changed = structuredClone(records);
		const row = changed[1];
		if (!row) throw new Error("Missing synthetic row");
		row[field] = value;
		expect(() => validateRoster(encodeCsv(changed))).toThrow();
	}
	expect(() => validateRoster(encodeCsv(records.slice(0, 50)))).toThrow();
	for (const field of [0, 2]) {
		const changed = structuredClone(records);
		const row = changed[2];
		if (!row) throw new Error("Missing synthetic row");
		row[field] = changed[1]?.[field] ?? "";
		expect(() => validateRoster(encodeCsv(changed))).toThrow(
			"DUPLICATE_CSV_IDENTITY",
		);
	}
	for (const malformed of ["", "wrong,header\n", 'nim,"unclosed'])
		expect(() => validateRoster(malformed)).toThrow();
	await expect(
		readRoster(join(import.meta.dir, "missing.csv")),
	).rejects.toThrow("LOADTEST_CSV_MISSING_OR_UNREADABLE");
});

test("partial/conflicting credentials/profiles/grants fail closed", async () => {
	for (const count of [1, 49, 51])
		expect(() => validateAccountState(count, 0)).toThrow();
	expect(() => validateAccountState(50, 1)).toThrow(
		"LOADTEST_PRIVILEGE_CONFLICT",
	);
	expect(() => validateAccountState(0, 0)).not.toThrow();
	expect(() => validateAccountState(50, 0)).not.toThrow();
	for (const changes of [
		{ credentials: 49 },
		{ profiles: 49 },
		{ grants: 1 },
	]) {
		const db = {
			$client: {
				query: async () => ({
					rows: [
						{
							matched: 50,
							grants: 0,
							credentials: 50,
							profiles: 50,
							initialFlags: 50,
							...changes,
						},
					],
				}),
			},
		} as unknown as Database;
		await expect(inspectAccounts(db, rows)).rejects.toThrow();
	}
	await expect(prepareLoadtestCredentials([])).rejects.toThrow(
		"PARTIAL_OR_UNEXPECTED_LOADTEST_STATE",
	);
});

test("existing local scratch guard still rejects every Supabase target", () => {
	expect(() => localProvisioningTarget(url)).toThrow(
		"LOCAL_SCRATCH_TARGET_REQUIRED",
	);
	expect(() =>
		localProvisioningTarget(
			`postgresql://postgres:synthetic-secret@db.${dev}.supabase.co:5432/postgres`,
		),
	).toThrow("LOCAL_SCRATCH_TARGET_REQUIRED");
});

test("URL fallback and missing apply confirmation stop before any connection; errors contain no secrets", async () => {
	const unrelated = {
		DATABASE_URL: url,
		DIRECT_DB_URL: url,
		PROD_DB_URL: url,
		RESORA_LOADTEST_DEV_PROJECT_REF: dev,
		RESORA_LOADTEST_PROD_PROJECT_REF: prod,
	};
	await expect(run([], unrelated)).rejects.toThrow("EXPLICIT_DEV_URL_REQUIRED");
	await expect(
		run(["--apply"], { ...unrelated, RESORA_LOADTEST_DEV_DB_URL: url }),
	).rejects.toThrow("MATCHING_DEV_APPLY_CONFIRMATION_REQUIRED");
	const child = Bun.spawnSync(
		[
			process.execPath,
			"--no-env-file",
			join(import.meta.dir, "provision-dev.ts"),
			"--apply",
		],
		{
			env: { ...process.env, ...unrelated, RESORA_LOADTEST_DEV_DB_URL: url },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	expect(child.exitCode).toBe(1);
	const output =
		new TextDecoder().decode(child.stdout) +
		new TextDecoder().decode(child.stderr);
	expect(output).toContain("MATCHING_DEV_APPLY_CONFIRMATION_REQUIRED");
	expect(output).toContain("stage=TARGET");
	await expect(
		run(["--check", "--ca-file", "missing-loadtest-ca.pem"], {
			...unrelated,
			RESORA_LOADTEST_DEV_DB_URL: url,
		}),
	).rejects.toMatchObject({
		stage: "TARGET",
		code: "INVALID_ARGUMENTS",
	});
	for (const sensitive of [url, "synthetic-secret", dev, prod])
		expect(output).not.toContain(sensitive);
});

test("reused provisioning dry-run is read-only, exact existing accounts stay unchanged, conflicts reject", async () => {
	for (const scenario of ["new", "existing", "conflict"] as const) {
		let transactionOptions: unknown;
		let writes = 0;
		const existing = rows.map((row) => ({
			id: row.nim,
			nim: row.nim,
			name: row.name,
			email: row.email,
			actor: "SR",
			isActive: true,
			department: "RND",
			position: "ANGGOTA",
			buildingId: "synthetic-building",
		}));
		if (scenario === "conflict" && existing[0])
			existing[0].name = "Conflicting synthetic identity";
		const double = {
			transaction: async (
				body: (tx: unknown) => Promise<unknown>,
				options: unknown,
			) => {
				transactionOptions = options;
				return body(double);
			},
			insert: () => {
				writes++;
				throw new Error("Unexpected write");
			},
			select: () => {
				let table: unknown;
				const query = {
					from: (value: unknown) => {
						table = value;
						return query;
					},
					leftJoin: () => query,
					where: async () => {
						if (table === departments) return [{ code: "RND", isActive: true }];
						if (table === positions)
							return [{ code: "ANGGOTA", isActive: true }];
						if (table === buildings)
							return [{ id: "synthetic-building", code: "A", isActive: true }];
						if (table === user) return scenario === "new" ? [] : existing;
						if (table === account)
							return existing.map((row) => ({ userId: row.id }));
						return [];
					},
				};
				return query;
			},
		} as unknown as Database;
		const preview = provisionSrAccounts({
			db: double,
			csv,
			mode: "dry-run",
			projectRoot: ".",
			authConfig: {
				BETTER_AUTH_URL: "http://localhost:3000",
				CORS_ORIGIN: "http://localhost:3001",
				BETTER_AUTH_SECRET: "synthetic-only-00000000000000000000",
			},
		});
		if (scenario === "conflict")
			await expect(preview).rejects.toThrow("EXISTING_ACCOUNT_CONFLICT");
		else
			expect(await preview).toMatchObject({
				created: scenario === "new" ? 50 : 0,
				unchanged: scenario === "new" ? 0 : 50,
			});
		expect(writes).toBe(0);
		expect(transactionOptions).toEqual({
			accessMode: "read only",
			isolationLevel: "repeatable read",
		});
	}
});

test("existing converter accepts only a COMMITTED checksum-matched full export (synthetic tmp copy)", async () => {
	const directory = resolve(
		import.meta.dir,
		"../../tmp",
		`loadtest-converter-${randomUUID()}`,
	);
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "convert-credentials.py"),
		await readFile(join(import.meta.dir, "convert-credentials.py")),
	);
	await writeFile(join(directory, "sr-loadtest-50.csv"), csv);
	const exported = encodeCsv([
		["nim", "name", "email", "temporary_password"],
		...rows.map((row, index) => [
			row.nim,
			row.name,
			row.email,
			`SyntheticOnly${index.toString().padStart(3, "0")}`,
		]),
	]);
	const credentials = join(directory, "credentials.csv");
	await writeFile(credentials, exported);
	const metadata = {
		count: 50,
		sha256: createHash("sha256").update(exported).digest("hex"),
	};
	const convert = () =>
		Bun.spawnSync(
			["py", "-3", join(directory, "convert-credentials.py"), credentials],
			{ stdout: "pipe", stderr: "pipe" },
		);
	await writeFile(
		join(directory, "status.json"),
		JSON.stringify({ ...metadata, state: "PREPARED" }),
	);
	expect(convert().exitCode).toBe(1);
	await writeFile(
		join(directory, "status.json"),
		JSON.stringify({ ...metadata, state: "COMMITTED" }),
	);
	const converted = convert();
	expect(converted.exitCode).toBe(0);
	expect(new TextDecoder().decode(converted.stdout)).not.toContain(
		"SyntheticOnly",
	);
	const accounts = JSON.parse(
		await readFile(join(directory, "accounts.local.json"), "utf8"),
	) as { accounts: { username: string; password: string }[] };
	expect(accounts.accounts).toHaveLength(50);
	expect(new Set(accounts.accounts.map((entry) => entry.username)).size).toBe(
		50,
	);
	expect(convert().exitCode).toBe(1); // Existing credential fixtures are never overwritten.
});

test("k6 maps 2/5/10/25/50 VUs to distinct accounts without network execution", async () => {
	const source = (await readFile(join(import.meta.dir, "loadtest.js"), "utf8"))
		.replace(/^import .*;\r?$/gm, "")
		.replace("export const options", "const options")
		.replace("export function setup", "function setup")
		.replace("export default function", "function journey");
	const create = new Function(
		"http",
		"check",
		"SharedArray",
		"vu",
		"Counter",
		"Trend",
		"open",
		"__ENV",
		"console",
		`${source}\nreturn { options, setup, journey };`,
	);
	for (const vus of [2, 5, 10, 25, 50]) {
		const selected = new Set<string>();
		const vu = { idInTest: 1 };
		const http = {
			post: (_url: string, body: string) => {
				selected.add((JSON.parse(body) as { username: string }).username);
				return { status: 200, timings: { duration: 1 } };
			},
			get: () => ({
				status: 200,
				headers: { "Content-Type": "text/html" },
				timings: { duration: 1 },
				html: () => ({
					find: (selector: string) => ({
						text: () =>
							selector === "h1"
								? "Dashboard SR"
								: selector === "h2"
									? "Selamat datang, synthetic."
									: `NIM: ${rows[vu.idInTest - 1]?.nim}`,
						size: () => 0,
					}),
				}),
			}),
		};
		const metric = class {
			add() {}
		};
		const sharedArray = class extends Array<unknown> {
			constructor(_name: string, read: () => unknown[]) {
				super(...read());
			}
		};
		const script = create(
			http,
			() => {},
			sharedArray,
			vu,
			metric,
			metric,
			() =>
				JSON.stringify({
					accounts: rows.map((row) => ({
						username: row.nim,
						password: "synthetic-offline-only",
					})),
				}),
			{
				VUS: String(vus),
				APPROVE_ISOLATED_TARGET: "yes",
				TARGET_ORIGIN: "https://dev.example.invalid",
				WEB_ORIGIN: "https://dev.example.invalid",
			},
			{
				warn: () => {
					throw new Error("Successful requests must stay quiet");
				},
			},
		);
		expect(script.options.scenarios.auth_journey.vus).toBe(vus);
		const config = script.setup();
		for (let index = 1; index <= vus; index++) {
			vu.idInTest = index;
			script.journey(config);
		}
		expect(selected.size).toBe(vus);
	}
	expect(csvColumns).toHaveLength(7);
});

test("k6 failure diagnostics log only fixed phase/status/classification and preserve request flow", async () => {
	const source = (await readFile(join(import.meta.dir, "loadtest.js"), "utf8"))
		.replace(/^import .*;\r?$/gm, "")
		.replace("export const options", "const options")
		.replace("export function setup", "function setup")
		.replace("export default function", "function journey");
	const create = new Function(
		"http",
		"check",
		"SharedArray",
		"vu",
		"Counter",
		"Trend",
		"open",
		"__ENV",
		"console",
		`${source}\nreturn { setup, journey };`,
	);
	for (const [status, classification] of [
		[429, "RATE_LIMITED"],
		[401, "UNAUTHORIZED"],
		[403, "FORBIDDEN"],
		[302, "REDIRECT"],
		[307, "REDIRECT"],
		[400, "OTHER"],
		[404, "OTHER"],
		[500, "SERVER_ERROR"],
		[503, "SERVER_ERROR"],
		[0, "NETWORK_ERROR"],
		[200, "UNAUTHENTICATED_DASHBOARD"],
	] as const) {
		for (const phase of ["LOGIN", "DASHBOARD"] as const) {
			if (status === 200 && phase === "LOGIN") continue;
			const logs: unknown[][] = [];
			let posts = 0;
			let gets = 0;
			const response = (code: number) => ({
				status: code,
				timings: { duration: 1 },
				body: "sensitive-response-body",
				headers: {
					"Content-Type": "text/html",
					"set-cookie": "sensitive-cookie",
				},
				html: () => ({
					find: () => ({ text: () => "sensitive-login-page", size: () => 1 }),
				}),
			});
			const http = {
				post: () => {
					posts++;
					return response(phase === "LOGIN" ? status : 200);
				},
				get: () => {
					gets++;
					return response(status);
				},
			};
			const metric = class {
				add() {}
			};
			const sharedArray = class extends Array<unknown> {
				constructor(_name: string, read: () => unknown[]) {
					super(...read());
				}
			};
			const script = create(
				http,
				() => {},
				sharedArray,
				{ idInTest: 1 },
				metric,
				metric,
				() =>
					JSON.stringify({
						accounts: [
							{
								username: "lt_resora_20261014_001",
								password: "sensitive-password",
							},
						],
					}),
				{
					VUS: "1",
					APPROVE_ISOLATED_TARGET: "yes",
					TARGET_ORIGIN: "https://dev.example.invalid",
					WEB_ORIGIN: "https://dev.example.invalid",
					VERCEL_BYPASS_SECRET: "sensitive-token",
				},
				{ warn: (...args: unknown[]) => logs.push(args) },
			);
			script.journey(script.setup());
			expect(posts).toBe(1);
			expect(gets).toBe(phase === "LOGIN" ? 0 : 1);
			expect(logs).toEqual([
				[
					`RESORA_REQUEST_FAILURE phase=${phase} status=${status} classification=${classification}`,
				],
			]);
			expect(JSON.stringify(logs)).not.toMatch(
				/sensitive|lt_resora_|cookie|password|username|Authorization|body|token|https:/i,
			);
		}
	}
});
