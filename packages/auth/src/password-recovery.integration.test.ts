import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createSrAccount } from "../../api/src/modules/identity/sr-account";
import { localProvisioningTarget } from "../../api/src/modules/identity/sr-provisioning";
import { createAuth } from "./index";
import { ResetMailError } from "./password-reset-mail";

// Opt in only after migrating a NEW disposable DB. No Varlock/remote fallback.
// A local operator must create/grant the NOLOGIN recovery_unauthorized role to
// the table-owning runtime test role. Audit fixtures intentionally remain immutable.
const value = process.env.RESORA_IDENTITY_TEST_DB_URL;
const config = {
	BETTER_AUTH_URL: "https://web.example.test",
	CORS_ORIGIN: "https://web.example.test",
	BETTER_AUTH_SECRET: "synthetic-application-secret-00000000000",
	AUTH_RATE_LIMIT_ENABLED: "false" as const,
	PASSWORD_RESET_EMAIL_ENABLED: "true" as const,
	NODE_ENV: "test",
};
const initial = "SyntheticInitialPassword42";
const replacement = "SyntheticReplacementPassword43";
const run = randomBytes(5).toString("hex");
let sequence = 0;

(value ? describe : describe.skip)(
	"recovery on verified disposable PostgreSQL",
	() => {
		let db: Database;
		beforeAll(async () => {
			const url = new URL(localProvisioningTarget(value));
			db = createDb({ DATABASE_URL: url.href, DB_POOL_MAX: 3 });
			const identity = await db.$client.query(
				"SELECT current_database() AS name, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port",
			);
			const actual = identity.rows[0];
			expect(actual.name).toBe(url.pathname.slice(1));
			expect(["127.0.0.1", "::1"].includes(actual.host)).toBe(true);
			expect(actual.port).toBe(Number(url.port || 5432));
			expect(actual.role).toBe(decodeURIComponent(url.username));
			const migrations = readMigrationFiles({
				migrationsFolder: join(import.meta.dir, "../../db/src/migrations"),
			});
			const history = await db.$client.query(
				"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
			);
			expect(history.rows.map((row) => row.hash)).toEqual(
				migrations.map((migration) => migration.hash),
			);
			await seedOrganization(db);
		});
		afterAll(async () => {
			await db?.$client.end();
		});

		async function fixture() {
			const building = await db.$client.query(
				"SELECT id FROM buildings WHERE code='A' AND is_active",
			);
			const username = `recovery.${run}.${sequence++}`;
			const email = `${username}@example.invalid`;
			const id = await db.transaction(async (tx) => {
				// The same tx-bound auth/internal adapter path used by CSV/admin provisioning.
				const context = await createAuth(config, tx).$context;
				return createSrAccount(
					tx,
					context,
					{
						nim: username,
						name: "Synthetic Recovery",
						email,
						departmentCode: "RND",
						positionCode: "ANGGOTA",
						buildingId: building.rows[0].id,
						isActive: true,
					},
					await context.password.hash(initial),
				);
			});
			const app = createAuth(config, db);
			await app.api.signInUsername({ body: { username, password: initial } });
			return { id, email, app };
		}
		async function issue(email: string) {
			let link = "";
			const cli = createAuth(
				{ ...config, BETTER_AUTH_SECRET: randomBytes(32).toString("hex") },
				db,
				[],
				{
					manualLink: (issued) => {
						link = issued;
					},
				},
			);
			// Exactly the manual CLI's native issuance path; never display its output.
			try {
				await cli.api.requestPasswordReset({ body: { email } });
			} catch {
				throw Error("NATIVE_MANUAL_ISSUANCE_FAILED");
			}
			expect(!!link).toBe(true);
			return (
				new URLSearchParams(new URL(link).hash.slice(1)).get("token") ?? ""
			);
		}
		async function state(id: string) {
			const result = await db.$client.query(
				`SELECT a.password, p.must_change_password AS flag,
		 (SELECT count(*)::int FROM session WHERE user_id=$1) AS sessions,
		 (SELECT count(*)::int FROM verification WHERE value=$1) AS tokens,
		 (SELECT count(*)::int FROM password_reset_audit WHERE user_id=$1 AND event_type='RESET_COMPLETED') AS completed
		 FROM account a JOIN user_profiles p ON p.user_id=a.user_id WHERE a.user_id=$1 AND a.provider_id='credential'`,
				[id],
			);
			return result.rows[0];
		}
		async function rejected(action: () => Promise<unknown>, expected: string) {
			let code: string | undefined;
			try {
				await action();
			} catch (error) {
				code = (error as { code?: string }).code;
			}
			expect(code).toBe(expected); // Never print SQL, params, credentials or native tokens.
		}

		test("reviewed migration history, owner-role INSERT, RLS default deny and append-only triggers", async () => {
			const role = await db.$client.query(
				"SELECT r.rolsuper, r.rolbypassrls, c.relrowsecurity, pg_get_userbyid(c.relowner)=current_user AS owns FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname=current_user AND c.oid='public.password_reset_audit'::regclass",
			);
			expect(role.rows[0]).toEqual({
				rolsuper: false,
				rolbypassrls: false,
				relrowsecurity: true,
				owns: true,
			});
			const guard = await db.$client.query(
				"SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid='public.password_reset_audit'::regclass AND tgfoid='public.guard_account_audit_mutation()'::regprocedure AND NOT tgisinternal",
			);
			expect(guard.rows[0].count).toBe(2);
			const id = randomUUID();
			await db.$client.query(
				"INSERT INTO password_reset_audit(id,target_email,event_type,source) VALUES($1,'synthetic@example.invalid','REQUESTED','PUBLIC')",
				[id],
			);
			for (const statement of [
				"UPDATE password_reset_audit SET source='MANUAL' WHERE id=$1",
				"DELETE FROM password_reset_audit WHERE id=$1",
			])
				await rejected(() => db.$client.query(statement, [id]), "23514");
			await rejected(
				() => db.$client.query("TRUNCATE password_reset_audit"),
				"23514",
			);
			const client = await db.$client.connect();
			try {
				await client.query("BEGIN");
				await client.query(
					"GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON password_reset_audit TO recovery_unauthorized",
				);
				await client.query("SET LOCAL ROLE recovery_unauthorized");
				expect(
					(await client.query("SELECT * FROM password_reset_audit")).rows
						.length,
				).toBe(0);
				for (const statement of [
					"UPDATE password_reset_audit SET source='MANUAL'",
					"DELETE FROM password_reset_audit",
				])
					expect((await client.query(statement)).rowCount).toBe(0);
				await client.query("SAVEPOINT rejected");
				await rejected(
					() =>
						client.query(
							"INSERT INTO password_reset_audit(target_email,event_type,source) VALUES('synthetic@example.invalid','REQUESTED','PUBLIC')",
						),
					"42501",
				);
				await client.query("ROLLBACK TO SAVEPOINT rejected");
				await rejected(
					() => client.query("TRUNCATE password_reset_audit"),
					"23514",
				);
			} finally {
				await client.query("ROLLBACK");
				client.release();
			}
			expect(
				(
					await db.$client.query(
						"SELECT count(*)::int AS count FROM password_reset_audit WHERE id=$1",
						[id],
					)
				).rows[0].count,
			).toBe(1);
		});

		test("REQUESTED and SMTP_FAILED insert with exact per-request correlation under the runtime owner", async () => {
			const f = await fixture();
			const app = createAuth(config, db, [], {
				send: async () => {
					throw new ResetMailError("SMTP_CONNECT");
				},
			});
			const responses = await Promise.all(
				[1, 2].map(() =>
					app.handler(
						new Request(
							`${config.BETTER_AUTH_URL}/api/auth/request-password-reset`,
							{
								method: "POST",
								headers: {
									origin: config.CORS_ORIGIN,
									"content-type": "application/json",
								},
								body: JSON.stringify({ email: f.email }),
							},
						),
					),
				),
			);
			expect(responses.every((response) => response.status === 200)).toBe(true);
			const rows = await db.$client.query(
				"SELECT event_type,request_id,error_code FROM password_reset_audit WHERE user_id=$1",
				[f.id],
			);
			expect(rows.rowCount).toBe(4);
			const requests = rows.rows.filter(
				(row) => row.event_type === "REQUESTED",
			);
			expect(new Set(requests.map((row) => row.request_id)).size).toBe(2);
			for (const request of requests)
				expect(
					rows.rows.filter(
						(row) =>
							row.event_type === "SMTP_FAILED" &&
							row.request_id === request.request_id &&
							row.error_code === "SMTP_CONNECT",
					).length,
				).toBe(1);
		});

		test("manual CLI secret is independent of native tokens redeemed by another app instance", async () => {
			const f = await fixture();
			const token = await issue(f.email);
			const before = await state(f.id);
			expect(before.sessions > 0 && before.tokens > 0 && before.flag).toBe(
				true,
			);
			let success = false;
			try {
				success = (
					await f.app.api.resetPassword({
						body: { token, newPassword: replacement },
					})
				).status;
			} catch {
				/* No raw native error/secret output. */
			}
			expect(success).toBe(true);
			const after = await state(f.id);
			expect(after.flag).toBe(false);
			expect(after.sessions).toBe(0);
			expect(after.tokens).toBe(0);
			expect(after.completed).toBe(1);
			expect(
				after.password !== replacement && after.password !== before.password,
			).toBe(true);
			expect(
				await (await f.app.$context).password.verify({
					hash: after.password,
					password: replacement,
				}),
			).toBe(true);
			const audit = await db.$client.query(
				"SELECT event_type,source FROM password_reset_audit WHERE user_id=$1 ORDER BY created_at,id",
				[f.id],
			);
			expect(audit.rows.map((row) => row.event_type).sort()).toEqual([
				"MANUAL_LINK_ISSUED",
				"RESET_COMPLETED",
			]);
			let reused = false;
			try {
				await f.app.api.resetPassword({
					body: { token, newPassword: replacement },
				});
				reused = true;
			} catch {
				/* Expected. */
			}
			expect(reused).toBe(false);
		});

		test("HTTP reset preserves Origin enforcement and the native success body", async () => {
			const f = await fixture();
			const token = await issue(f.email);
			const post = (origin: string) =>
				f.app.handler(
					new Request(`${config.BETTER_AUTH_URL}/api/auth/reset-password`, {
						method: "POST",
						headers: { origin, "content-type": "application/json" },
						body: JSON.stringify({ token, newPassword: replacement }),
					}),
				);
			expect((await post("https://attacker.invalid")).status).toBe(403);
			const response = await post(config.CORS_ORIGIN);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ status: true });
			expect((await state(f.id)).completed).toBe(1);
		});

		test("separate app instances concurrently consume one native token exactly once", async () => {
			const f = await fixture();
			const token = await issue(f.email);
			const other = createAuth(config, db);
			const results = await Promise.all(
				[f.app, other].map(async (app) => {
					try {
						await app.api.resetPassword({
							body: { token, newPassword: replacement },
						});
						return true;
					} catch {
						return false;
					}
				}),
			);
			expect(results.filter(Boolean).length).toBe(1);
			const after = await state(f.id);
			expect(after.tokens).toBe(0);
			expect(after.sessions).toBe(0);
			expect(after.completed).toBe(1);
		});

		for (const failure of ["password", "session", "audit"] as const) {
			test(`${failure} write failure rolls back token/password/flag/sessions/completion audit`, async () => {
				const f = await fixture();
				const token = await issue(f.email);
				const before = await state(f.id);
				const table =
					failure === "password"
						? "account"
						: failure === "session"
							? "session"
							: "password_reset_audit";
				// Entire database is disposable/synthetic. A bounded trigger injects a real SQL failure.
				await db.$client.query(
					"CREATE FUNCTION recovery_review_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='synthetic recovery failure'; END $$",
				);
				await db.$client.query(
					`CREATE TRIGGER recovery_review_fail BEFORE ${failure === "password" ? "UPDATE" : failure === "session" ? "DELETE" : "INSERT"} ON ${table} FOR EACH ROW ${failure === "audit" ? "WHEN (NEW.event_type='RESET_COMPLETED')" : ""} EXECUTE FUNCTION recovery_review_fail()`,
				);
				const logger = spyOn(console, "error").mockImplementation(() => {});
				try {
					let succeeded = false;
					try {
						await f.app.api.resetPassword({
							body: { token, newPassword: replacement },
						});
						succeeded = true;
					} catch {
						/* Expected SQL failure, never expose raw token-bearing errors. */
					}
					expect(succeeded).toBe(false);
					const after = await state(f.id);
					expect(after.password === before.password).toBe(true);
					expect(after.flag).toBe(true);
					expect(after.sessions).toBe(before.sessions);
					expect(after.tokens).toBe(before.tokens);
					expect(after.completed).toBe(0);
				} finally {
					logger.mockRestore();
					await db.$client.query(
						`DROP TRIGGER recovery_review_fail ON ${table}`,
					);
					await db.$client.query("DROP FUNCTION recovery_review_fail()");
				}
			});
		}

		test("tx-bound provisioning still rolls back when its outer profile operation fails", async () => {
			const email = `rollback.${run}@example.invalid`;
			try {
				await db.transaction(async (tx) => {
					const context = await createAuth(config, tx).$context;
					await context.internalAdapter.createUser(
						{
							email,
							name: "Synthetic rollback",
							emailVerified: false,
							username: `rollback.${run}`,
						},
						{ method: "sr-csv" },
					);
					throw Error("SYNTHETIC_PROFILE_WRITE_FAILURE");
				});
			} catch {
				/* Outer rollback is the expected provisioning contract. */
			}
			expect(
				(
					await db.$client.query(
						'SELECT count(*)::int AS count FROM "user" WHERE email=$1',
						[email],
					)
				).rows[0].count,
			).toBe(0);
		});
	},
);
