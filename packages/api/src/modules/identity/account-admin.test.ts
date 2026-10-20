import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type AuthConfig, createAuth } from "@resora/auth";
import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { accountAuditLogs } from "@resora/db/schema/identity";
import { getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { appRouter } from "../../routers";
import {
	archiveAccountSchema,
	createAccountSchema,
	listAccountsSchema,
	updateAccountSchema,
} from "./account-admin.schema";
import { provisionSrAccounts } from "./sr-provisioning";

const authConfig: AuthConfig = {
	BETTER_AUTH_URL: "http://127.0.0.1:3000",
	BETTER_AUTH_SECRET: "synthetic-sa02-auth-secret-0000000000000",
	CORS_ORIGIN: "http://127.0.0.1:3001",
	NODE_ENV: "test",
};
const input = {
	name: "Synthetic SR",
	nim: "0000000009",
	email: "synthetic@example.invalid",
	departmentCode: "HCO",
	positionCode: "ANGGOTA",
	buildingCode: "A",
};

// Real router, service, Better Auth internal adapter and hashing; persistence is offline.
// This double does not establish PostgreSQL trigger/lock/concurrency evidence.
function fixture() {
	const admin: ActiveSrIdentity = {
		userId: "synthetic-admin",
		nim: "0000000001",
		actor: "SR",
		isActive: true,
		mustChangePassword: false,
		departmentCode: "RND",
		positionCode: "ANGGOTA",
		buildingId: randomUUID(),
		isSuperadmin: true,
	};
	const buildingId = randomUUID();
	const state = {
		granted: true,
		revokeInTransaction: false,
		failTable: "",
		uniqueRace: false,
		commitAcknowledgementLost: false,
		tables: {} as Record<string, Record<string, unknown>[]>,
		queries: [] as {
			table: string;
			fields: string[];
			params: unknown[];
			limit?: number;
			offset?: number;
		}[],
		locks: [] as string[],
		sql: [] as string[],
		inactiveReference: "",
	};
	const dbDouble = {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const saved = structuredClone(state.tables);
			if (state.revokeInTransaction) state.granted = false;
			let result: unknown;
			try {
				result = await run(dbDouble);
			} catch (error) {
				state.tables = saved;
				throw error;
			}
			if (state.commitAcknowledgementLost)
				throw new Error("synthetic lost commit acknowledgement");
			return result;
		},
		execute: async (query: SQL) => {
			state.sql.push(new PgDialect().sqlToQuery(query).sql);
			return { rows: [] };
		},
		select: (fields?: Record<string, unknown>) => {
			const record = {
				table: "",
				fields: Object.keys(fields ?? {}),
				params: [] as unknown[],
				limit: undefined as number | undefined,
				offset: undefined as number | undefined,
			};
			let joined = false;
			const query = {
				from: (table: Parameters<typeof getTableName>[0]) => {
					record.table = getTableName(table);
					state.queries.push(record);
					return query;
				},
				innerJoin: () => {
					joined = true;
					return query;
				},
				leftJoin: () => query,
				where: (value: SQL) => {
					record.params = new PgDialect().sqlToQuery(value).params;
					return query;
				},
				for: (mode: string) => {
					state.locks.push(`${record.table}:${mode}`);
					return query;
				},
				orderBy: () => query,
				limit: (limit: number) => {
					record.limit = limit;
					return query;
				},
				offset: (offset: number) => {
					record.offset = offset;
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Mirrors awaitable Drizzle queries in an offline double.
				then: (resolve: (rows: unknown[]) => unknown) => {
					let rows: Record<string, unknown>[] = [];
					if (record.table === "user_profiles")
						rows = admin.isActive
							? [
									{
										...admin,
										tenureStatus: "ACTIVE",
										isSuperadmin: state.granted,
										name: "Synthetic admin",
										buildingCode: "B",
										buildingName: "Gedung B",
									},
								]
							: [];
					if (
						record.table === "user_profiles" &&
						!record.params.includes(admin.userId)
					)
						rows = (state.tables.user_profiles ?? []).filter((row) =>
							record.params.includes(row.userId),
						);

					if (record.table === "system_privileges")
						rows = state.granted ? [{ userId: admin.userId }] : [];
					if (
						["departments", "positions", "buildings"].includes(record.table)
					) {
						const codes =
							record.table === "departments"
								? ["HCO", "INTI", "RND"]
								: record.table === "positions"
									? ["ANGGOTA", "KADEP", "KETUM"]
									: ["A", "B"];
						rows = codes
							.filter(
								(code) =>
									record.params.includes(true) || record.params.includes(code),
							)
							.map((code) => ({
								id: buildingId,
								code,
								name: code,
								isActive: state.inactiveReference !== record.table,
							}));
					}
					if (record.table === "user") {
						const users = state.tables.user ?? [];
						if (record.fields.includes("total"))
							rows = [{ total: users.length }];
						else if (joined)
							rows = users
								.slice(
									record.offset ?? 0,
									record.limit === undefined
										? undefined
										: (record.offset ?? 0) + record.limit,
								)
								.map((row) => ({
									userId: row.id,
									nim: row.username,
									name: row.name,
									email: row.email,
									departmentCode: "HCO",
									department: "HCO",
									positionCode: "ANGGOTA",
									position: "Anggota",
									buildingCode: "A",
									building: "Gedung A",
									isActive: false,
									isSuperadmin: false,
								}));
						else
							rows = users
								.filter(
									(row) =>
										record.params.includes(row.username) ||
										record.params.includes(String(row.email).toLowerCase()),
								)
								.map((row) => ({ nim: row.username, email: row.email }));
					}
					return Promise.resolve(rows).then(resolve);
				},
			};
			return query;
		},
		update: (table: Parameters<typeof getTableName>[0]) => ({
			set: (values: Record<string, unknown>) => ({
				where: (condition: SQL) => {
					const run = async () => {
						const name = getTableName(table);
						if (state.failTable === name)
							throw new Error("synthetic write failure");
						const params = new PgDialect().sqlToQuery(condition).params;
						const rows = (state.tables[name] ?? []).filter(
							(row) =>
								params.includes(row.userId) &&
								(name !== "account" || params.includes(row.providerId)),
						);
						for (const row of rows) Object.assign(row, values);
						return rows;
					};
					return {
						returning: run,
						// biome-ignore lint/suspicious/noThenProperty: Drizzle write double.
						then: (
							resolve: (rows: unknown[]) => unknown,
							reject: (error: unknown) => unknown,
						) => run().then(resolve, reject),
					};
				},
			}),
		}),
		delete: (table: Parameters<typeof getTableName>[0]) => ({
			where: async (condition: SQL) => {
				const name = getTableName(table);
				if (state.failTable === name)
					throw new Error("synthetic write failure");
				const params = new PgDialect().sqlToQuery(condition).params;
				state.tables[name] = (state.tables[name] ?? []).filter(
					(row) => !params.includes(row.userId),
				);
			},
		}),

		insert: (table: Parameters<typeof getTableName>[0]) => ({
			values: (data: Record<string, unknown>) => {
				const name = getTableName(table);
				const run = async () => {
					if (state.failTable === name)
						throw new Error("synthetic write failure");
					if (state.uniqueRace && name === "user")
						throw Object.assign(new Error("synthetic uniqueness conflict"), {
							code: "23505",
						});
					const row = {
						id: randomUUID(),
						createdAt: new Date(),
						updatedAt: new Date(),
						...data,
					};
					state.tables[name] ??= [];
					state.tables[name].push(row);
					return [row];
				};
				return {
					returning: run,
					// biome-ignore lint/suspicious/noThenProperty: Mirrors awaitable Drizzle inserts.
					then: (
						resolve: (rows: unknown[]) => unknown,
						reject: (error: unknown) => unknown,
					) => run().then(resolve, reject),
				};
			},
		}),
	};
	const db = dbDouble as unknown as Database;
	const context = {
		db,
		authConfig,
		session: { user: { id: admin.userId } } as never,
	};
	return { db, state, admin, context, caller: appRouter.createCaller(context) };
}

test("SUPERADMIN creates through real Better Auth adapter/hash with atomic profiles/audit and one-time response", async () => {
	const f = fixture();
	const result = await f.caller.identity.createAccount({
		...input,
		email: `  ${input.email.toUpperCase()}  `,
	});
	expect(result.nim).toBe("0000000009");
	expect(result.email).toBe(input.email);
	expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(16);
	const credential = f.state.tables.account?.[0];
	const hash = credential?.password;
	if (typeof hash !== "string")
		throw new Error("Missing synthetic credential hash");
	const context = await createAuth(authConfig, f.db).$context;
	expect(
		await context.password.verify({ hash, password: result.temporaryPassword }),
	).toBe(true);
	expect(hash === result.temporaryPassword).toBe(false);
	expect(f.state.tables.user_profiles?.[0]).toMatchObject({
		userId: result.userId,
		actor: "SR",
		isActive: true,
		mustChangePassword: true,
	});
	expect(f.state.tables.sr_profiles?.[0]).toMatchObject({
		userId: result.userId,
		departmentCode: "HCO",
		positionCode: "ANGGOTA",
	});
	expect(f.state.tables.system_privileges).toBeUndefined();
	expect(f.state.tables.account_audit_logs?.[0]).toMatchObject({
		actorUserId: f.admin.userId,
		targetUserId: result.userId,
		action: "ACCOUNT_CREATED",
	});
	expect(
		JSON.stringify(f.state.tables.account_audit_logs).includes(
			result.temporaryPassword,
		),
	).toBe(false);
	expect(f.state.sql).toContain("SET CONSTRAINTS ALL IMMEDIATE");
	expect(f.state.locks).toContain("system_privileges:share");
});

for (const [label, overrides, code] of [
	["ordinary SR", { isSuperadmin: false }, "SUPERADMIN_REQUIRED"],
	["inactive", { isActive: false }, "Authentication required"],
	[
		"first password change",
		{ mustChangePassword: true },
		"PASSWORD_CHANGE_REQUIRED",
	],
	[
		"invalid assignment",
		{ departmentCode: "HCO", positionCode: "KETUM" },
		"SUPERADMIN_REQUIRED",
	],
] as const)
	test(`${label} cannot administer accounts through tRPC`, async () => {
		const f = fixture();
		Object.assign(f.admin, overrides);
		if ("isSuperadmin" in overrides) f.state.granted = overrides.isSuperadmin;
		await expect(f.caller.identity.listAccounts({})).rejects.toThrow(code);
		await expect(f.caller.identity.createAccount(input)).rejects.toThrow(code);
		expect(f.state.tables).toEqual({});
	});

test("anonymous and revoked grant deny direct API calls; transaction re-read rejects late revocation", async () => {
	const f = fixture();
	const anonymous = appRouter.createCaller({ ...f.context, session: null });
	await expect(anonymous.identity.createAccount(input)).rejects.toThrow(
		"Authentication required",
	);
	f.state.granted = false;
	await expect(f.caller.identity.accountReferences()).rejects.toThrow(
		"SUPERADMIN_REQUIRED",
	);
	f.state.granted = true;
	f.state.revokeInTransaction = true;
	await expect(f.caller.identity.createAccount(input)).rejects.toThrow(
		"SUPERADMIN_REQUIRED",
	);
	expect(f.state.tables).toEqual({});
});

test("duplicate NIM/email and raced DB uniqueness return sanitized conflicts without writes", async () => {
	for (const conflict of ["nim", "email", "race"]) {
		const f = fixture();
		if (conflict === "race") f.state.uniqueRace = true;
		else
			f.state.tables.user = [
				{
					username: conflict === "nim" ? input.nim : "another",
					email:
						conflict === "email"
							? input.email.toUpperCase()
							: "another@example.invalid",
				},
			];
		const saved = structuredClone(f.state.tables);
		await expect(f.caller.identity.createAccount(input)).rejects.toThrow(
			conflict === "nim"
				? "NIM_EXISTS"
				: conflict === "email"
					? "EMAIL_EXISTS"
					: "NIM_OR_EMAIL_EXISTS",
		);
		expect(f.state.tables).toEqual(saved);
	}
});

test("active DB references and official pair validation reject invalid assignment/reference", async () => {
	for (const field of [
		"departmentCode",
		"positionCode",
		"buildingCode",
	] as const) {
		const f = fixture();
		await expect(
			f.caller.identity.createAccount({ ...input, [field]: "UNKNOWN" }),
		).rejects.toThrow();
		expect(f.state.tables).toEqual({});
	}
	for (const table of ["departments", "positions", "buildings"]) {
		const f = fixture();
		f.state.inactiveReference = table;
		await expect(f.caller.identity.createAccount(input)).rejects.toThrow(
			"INVALID_OR_INACTIVE_ORGANIZATION_REFERENCE",
		);
		expect(f.state.tables).toEqual({});
	}
	const f = fixture();
	await expect(
		f.caller.identity.createAccount({
			...input,
			departmentCode: "INTI",
			positionCode: "KADEP",
		}),
	).rejects.toThrow("INVALID_ORGANIZATION_ASSIGNMENT");
});

test("profile/account/audit write failures roll back every partial account", async () => {
	for (const table of [
		"account",
		"user_profiles",
		"sr_profiles",
		"account_audit_logs",
	]) {
		const f = fixture();
		f.state.failTable = table;
		await expect(f.caller.identity.createAccount(input)).rejects.toThrow();
		expect(f.state.tables).toEqual({});
	}
});

test("lost commit acknowledgement reports uncertainty instead of claiming no account exists", async () => {
	const f = fixture();
	f.state.commitAcknowledgementLost = true;
	await expect(f.caller.identity.createAccount(input)).rejects.toThrow(
		"ACCOUNT_CREATE_OUTCOME_UNCONFIRMED",
	);
	expect(f.state.tables.user).toHaveLength(1);
	expect(f.state.tables.account_audit_logs).toHaveLength(1);
});

test("shared creator preserves CSV dry-run, eight-character credentials and COMMITTED output semantics", async () => {
	const f = fixture();
	const csv =
		"nim,name,email,department,position,building,is_active\n0000000009,Synthetic SR,synthetic@example.invalid,HCO,ANGGOTA,A,true\n";
	const options = {
		db: f.db,
		authConfig,
		csv,
		projectRoot: "synthetic-no-filesystem-output",
	};
	expect(
		await provisionSrAccounts({ ...options, mode: "dry-run" }),
	).toMatchObject({ created: 1, unchanged: 0 });
	expect(f.state.tables).toEqual({});
	let exportCommitted = false;
	await provisionSrAccounts({
		...options,
		mode: "apply",
		prepareOutput: async (records) => {
			expect(records).toHaveLength(1);
			expect(records[0]?.temporary_password.length).toBe(8);
			expect(
				/^[A-Za-z0-9]{8}$/.test(records[0]?.temporary_password ?? ""),
			).toBe(true);
			return {
				path: "synthetic-no-file-created.csv",
				mark: async (status) => {
					exportCommitted = status === "COMMITTED";
				},
			};
		},
	});
	expect(exportCommitted).toBe(true);
	expect(f.state.tables.user).toHaveLength(1);
	expect(f.state.tables.user_profiles?.[0]?.mustChangePassword).toBe(true);
});

test("listing uses bounded stable pagination/search/filters with no credential selection and includes inactive SR", async () => {
	const f = fixture();
	f.state.tables.user = [
		{
			id: "inactive-synthetic",
			username: "0000000010",
			name: "Synthetic inactive",
			email: "inactive@example.invalid",
			password: "must-not-be-selected",
		},
	];
	const result = await f.caller.identity.listAccounts({
		search: "_%",
		departmentCode: "HCO",
		isActive: false,
	});
	expect(result.accounts[0]).toMatchObject({
		nim: "0000000010",
		isActive: false,
	});
	expect(result.accounts[0]).not.toHaveProperty("password");
	const listing = f.state.queries.find((query) =>
		query.fields.includes("building"),
	);
	expect(listing?.limit).toBe(20);
	expect(listing?.offset).toBe(0);
	expect(listing?.params).toContain("%\\_\\%%");
	expect(listing?.params).toContain(false);
	await f.caller.identity.listAccounts({ page: 3, pageSize: 50 });
	expect(f.state.queries.at(-1)?.offset).toBe(100);
	expect(listAccountsSchema.safeParse({ pageSize: 51 }).success).toBe(false);
	for (const query of f.state.queries) {
		expect(query.fields.includes("password")).toBe(false);
		expect(query.fields.includes("token")).toBe(false);
	}
});

test("DB-backed dropdowns expose valid department/position pairs, not new dictionaries", async () => {
	const f = fixture();
	const result = await f.caller.identity.accountReferences();
	expect(
		result.positions.find((row) => row.code === "KETUM")?.departmentCodes,
	).toEqual(["INTI"]);
	expect(
		result.positions.find((row) => row.code === "KADEP")?.departmentCodes,
	).toEqual(["HCO", "RND"]);
});

test("input rejects blank names, malformed usernames/email and forged privileges; audit is metadata only", () => {
	for (const invalid of [
		{ name: " " },
		{ nim: "12" },
		{ nim: "12-abc" },
		{ email: "invalid" },
		{ isSuperadmin: true },
	])
		expect(
			createAccountSchema.safeParse({ ...input, ...invalid }).success,
		).toBe(false);
	const config = getTableConfig(accountAuditLogs);
	expect(config.foreignKeys).toHaveLength(2);
	expect(config.indexes).toHaveLength(2);
	expect(config.columns.map((column) => column.name)).toEqual([
		"id",
		"actor_user_id",
		"target_user_id",
		"action",
		"details",
		"created_at",
	]);
	const migration = readFileSync(
		`${import.meta.dir}/../../../../db/src/migrations/20261013170324_sa02_account_management/migration.sql`,
		"utf8",
	);
	expect(migration).toContain("BEFORE UPDATE OR DELETE");
	expect(migration).toContain("BEFORE TRUNCATE");
	expect(migration).not.toContain("DROP ");
});

test("admin snapshot returns the complete safe roster without pagination and denies non-admins", async () => {
	const f = fixture();
	f.state.tables.user = Array.from({ length: 65 }, (_, index) => ({
		id: `snapshot-${index}`,
		username: `000${index}`,
		name: `SR ${index}`,
		email: `sr${index}@example.invalid`,
		password: "never-return",
	}));
	const result = await f.caller.identity.accountSnapshot();
	expect(result.accounts).toHaveLength(65);
	const query = f.state.queries.find((row) => row.fields.includes("building"));
	expect(query?.limit).toBeUndefined();
	expect(query?.offset).toBeUndefined();
	expect(result.accounts[0]).not.toHaveProperty("password");
	f.state.granted = false;
	await expect(f.caller.identity.accountSnapshot()).rejects.toMatchObject({
		code: "FORBIDDEN",
	});
});

test("password reset hashes a fresh credential, revokes only target sessions, gates SR and audits atomically", async () => {
	const f = fixture();
	const created = await f.caller.identity.createAccount(input);
	f.state.tables.session = [{ userId: created.userId }, { userId: "other" }];
	const result = await f.caller.identity.resetAccountPassword({
		userId: created.userId,
	});
	const hash = f.state.tables.account?.[0]?.password as string;
	const context = await createAuth(authConfig, f.db).$context;
	expect(
		await context.password.verify({ hash, password: result.temporaryPassword }),
	).toBe(true);
	expect(
		await context.password.verify({
			hash,
			password: created.temporaryPassword,
		}),
	).toBe(false);
	expect(f.state.tables.user_profiles?.[0]?.passwordResetRequired).toBe(true);
	expect(f.state.tables.session).toEqual([{ userId: "other" }]);
	expect(f.state.tables.account_audit_logs?.at(-1)?.action).toBe(
		"PASSWORD_RESET",
	);
	expect(JSON.stringify(f.state.tables)).not.toContain(
		result.temporaryPassword,
	);
	const saved = structuredClone(f.state.tables);
	f.state.failTable = "account_audit_logs";
	await expect(
		f.caller.identity.resetAccountPassword({ userId: created.userId }),
	).rejects.toThrow();
	expect(f.state.tables).toEqual(saved);
	f.state.granted = false;
	await expect(
		f.caller.identity.resetAccountPassword({ userId: created.userId }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("account maintenance validates version and rejects username/privilege forgery", () => {
	const valid = {
		...input,
		userId: "synthetic-id",
		isActive: true,
		expectedUpdatedAt: "2026-10-19T00:00:00.001Z",
	};
	const { nim, ...editable } = valid;
	expect(updateAccountSchema.safeParse(editable).success).toBe(true);
	expect(updateAccountSchema.safeParse(valid).success).toBe(false);
	expect(
		updateAccountSchema.safeParse({ ...editable, isSuperadmin: true }).success,
	).toBe(false);
	expect(
		updateAccountSchema.safeParse({
			...editable,
			expectedUpdatedAt: "yesterday",
		}).success,
	).toBe(false);
	expect(
		archiveAccountSchema.safeParse({
			userId: valid.userId,
			expectedUpdatedAt: valid.expectedUpdatedAt,
		}).success,
	).toBe(true);
	expect(
		archiveAccountSchema.safeParse({
			userId: valid.userId,
			expectedUpdatedAt: valid.expectedUpdatedAt,
			isActive: true,
		}).success,
	).toBe(false);
});
