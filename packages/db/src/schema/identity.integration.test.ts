import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { Pool, type PoolClient } from "pg";

function scratchDatabaseUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(
			"Identity tests require a valid local scratch PostgreSQL URL",
		);
	}
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
		!/^\/resora_identity_test_[a-z0-9_]+$/.test(url.pathname) ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"Identity tests require loopback PostgreSQL and a resora_identity_test_* database, without URL options",
		);
	}
	return value;
}

test("database integrity test guard rejects Supabase and ordinary application databases", () => {
	for (const url of [
		"postgresql://db.example.invalid/resora_identity_test_synthetic",
		"postgresql://localhost/resora",
		"postgresql://localhost/resora_identity_test_synthetic?host=db.example.invalid",
		"postgresql://localhost/resora_identity_test_synthetic?options=anything",
		"not-a-url",
	]) {
		expect(() => scratchDatabaseUrl(url)).toThrow();
	}
	expect(
		scratchDatabaseUrl("postgresql://localhost/resora_identity_test_synthetic"),
	).toBe("postgresql://localhost/resora_identity_test_synthetic");
});

// Intentionally no fallback to DATABASE_URL, DIRECT_DB_URL or Varlock env files.
// No migration runner/DDL here: reviewed migrations must already be applied
// manually to a disposable local database before opting in.
const testUrl = process.env.RESORA_IDENTITY_TEST_DB_URL;
const databaseSuite = testUrl ? describe : describe.skip;
databaseSuite(
	"identity integrity against reviewed local PostgreSQL schema",
	() => {
		let pool: Pool;
		let client: PoolClient | undefined;
		const buildingId = "00000000-0000-4000-8000-000000000001";

		beforeAll(async () => {
			if (!testUrl) throw new Error("Scratch URL not configured");
			pool = new Pool({
				connectionString: scratchDatabaseUrl(testUrl),
				connectionTimeoutMillis: 5_000,
				max: 1,
			});
			try {
				const result = await pool.query<{
					tgname: string;
					tgdeferrable: boolean;
					tginitdeferred: boolean;
				}>(
					"SELECT tgname, tgdeferrable, tginitdeferred FROM pg_trigger WHERE tgrelid IN ('public.user_profiles'::regclass, 'public.sr_profiles'::regclass, 'public.\"user\"'::regclass) AND tgname = ANY($1::text[])",
					[
						[
							"user_profiles_sr_consistency",
							"sr_profiles_actor_consistency",
							"user_sr_nim_consistency",
						],
					],
				);
				expect(result.rows).toHaveLength(3);
				for (const trigger of result.rows) {
					expect(trigger.tgdeferrable).toBe(true);
					expect(trigger.tginitdeferred).toBe(true);
				}
			} catch {
				throw new Error(
					"Local scratch database unavailable or reviewed Phase 2A migrations missing; no migrations were run",
				);
			}
		});
		beforeEach(async () => {
			client = await pool.connect();
			await client.query("BEGIN");
			await client.query(
				"INSERT INTO departments(code, name) VALUES ('SYN_HCO', 'Synthetic HCO')",
			);
			await client.query(
				"INSERT INTO positions(code, name) VALUES ('SYN_KADIV', 'Synthetic KADIV')",
			);
			await client.query(
				"INSERT INTO buildings(id, code, name) VALUES ($1, 'SYN_BUILDING', 'Synthetic Building')",
				[buildingId],
			);
		});
		afterEach(async () => {
			if (client) {
				await client.query("ROLLBACK");
				client.release();
				client = undefined;
			}
		});
		afterAll(async () => {
			if (pool) await pool.end();
		});

		function connection(): PoolClient {
			if (!client) throw new Error("Scratch transaction not started");
			return client;
		}
		async function authUser(
			id = "synthetic-sr",
			username: string | null = "0000123456",
		) {
			await connection().query(
				'INSERT INTO "user"(id, name, email, username) VALUES ($1, $2, $3, $4)',
				[id, "Synthetic SR", `${id}@example.invalid`, username],
			);
		}
		async function profile(actor = "SR", id = "synthetic-sr") {
			await connection().query(
				"INSERT INTO user_profiles(user_id, actor) VALUES ($1, $2)",
				[id, actor],
			);
		}
		async function assignment(id = "synthetic-sr", department = "SYN_HCO") {
			await connection().query(
				"INSERT INTO sr_profiles(user_id, department_code, position_code, building_id) VALUES ($1, $2, 'SYN_KADIV', $3)",
				[id, department, buildingId],
			);
		}
		async function enforce() {
			await connection().query("SET CONSTRAINTS ALL IMMEDIATE");
		}
		async function validSr() {
			await authUser();
			await profile();
			await assignment();
		}

		test("complete SR identity commits its constraints and preserves a zero-prefixed NIM", async () => {
			await validSr();
			await enforce();
			const result = await connection().query(
				'SELECT u.username, p.actor, p.is_active, p.must_change_password FROM "user" u JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1',
				["synthetic-sr"],
			);
			expect(result.rows[0]).toEqual({
				username: "0000123456",
				actor: "SR",
				is_active: true,
				must_change_password: true,
			});
		});
		test("SR without an assignment fails the deferred constraint", async () => {
			await authUser();
			await profile();
			await expect(enforce()).rejects.toMatchObject({
				code: "23514",
				constraint: "sr_profile_actor_consistency",
			});
		});
		test("non-SR actors cannot have an SR assignment", async () => {
			await authUser();
			await profile("MAHASISWA");
			await assignment();
			await expect(enforce()).rejects.toMatchObject({ code: "23514" });
		});
		test("non-SR primary actor is valid without an SR profile", async () => {
			await authUser();
			await profile("MAHASISWA");
			await enforce();
		});
		test("changing SR actor alone cannot strand the SR profile", async () => {
			await validSr();
			await connection().query(
				"UPDATE user_profiles SET actor='MAHASISWA' WHERE user_id=$1",
				["synthetic-sr"],
			);
			await expect(enforce()).rejects.toMatchObject({ code: "23514" });
		});
		test("removing an assignment alone cannot leave an incomplete SR identity", async () => {
			await validSr();
			await connection().query("DELETE FROM sr_profiles WHERE user_id=$1", [
				"synthetic-sr",
			]);
			await expect(enforce()).rejects.toMatchObject({ code: "23514" });
		});
		test("actor and SR profile can transition consistently in the same transaction", async () => {
			await validSr();
			await connection().query("DELETE FROM sr_profiles WHERE user_id=$1", [
				"synthetic-sr",
			]);
			await connection().query(
				"UPDATE user_profiles SET actor='MAHASISWA' WHERE user_id=$1",
				["synthetic-sr"],
			);
			await enforce();
		});
		test("SR requires a nonblank auth-owned NIM", async () => {
			await authUser("synthetic-sr", null);
			await profile();
			await assignment();
			await expect(enforce()).rejects.toMatchObject({
				code: "23514",
				constraint: "sr_profile_nim_required",
			});
		});
		test("NIM cannot be cleared after creating a valid SR identity", async () => {
			await validSr();
			await connection().query('UPDATE "user" SET username=$1 WHERE id=$2', [
				" ",
				"synthetic-sr",
			]);
			await expect(enforce()).rejects.toMatchObject({
				code: "23514",
				constraint: "sr_profile_nim_required",
			});
		});
		test("duplicate NIM is rejected", async () => {
			await validSr();
			await expect(authUser("synthetic-duplicate")).rejects.toMatchObject({
				code: "23505",
			});
		});
		test("one primary actor row per account", async () => {
			await validSr();
			await expect(profile("ASUS")).rejects.toMatchObject({ code: "23505" });
		});
		test("one SR assignment per account", async () => {
			await validSr();
			await expect(assignment()).rejects.toMatchObject({ code: "23505" });
		});
		test("superadmin cannot be used as a primary actor", async () => {
			await authUser();
			await expect(profile("SUPERADMIN")).rejects.toMatchObject({
				code: "22P02",
			});
		});
		test("actor profile cannot reference a missing auth user", async () => {
			await expect(profile()).rejects.toMatchObject({ code: "23503" });
		});
		test("SR assignment cannot reference an auth user without an actor profile", async () => {
			await authUser();
			await expect(assignment()).rejects.toMatchObject({ code: "23503" });
		});
		test("assignment foreign keys reject nonexistent dictionaries", async () => {
			await authUser();
			await profile();
			await expect(
				assignment("synthetic-sr", "MISSING_SYNTHETIC_DEPARTMENT"),
			).rejects.toMatchObject({ code: "23503" });
		});
		test("SR assignment cannot omit required position", async () => {
			await authUser();
			await profile();
			await expect(
				connection().query(
					"INSERT INTO sr_profiles(user_id, department_code, building_id) VALUES ($1, 'SYN_HCO', $2)",
					["synthetic-sr", buildingId],
				),
			).rejects.toMatchObject({ code: "23502" });
		});
		test("dictionary names cannot be blank", async () => {
			await expect(
				connection().query(
					"INSERT INTO departments(code, name) VALUES ('SYN_BLANK', ' ')",
				),
			).rejects.toMatchObject({ code: "23514" });
		});
		test("building codes are unique", async () => {
			await expect(
				connection().query(
					"INSERT INTO buildings(code, name) VALUES ('SYN_BUILDING', 'Synthetic duplicate')",
				),
			).rejects.toMatchObject({ code: "23505" });
		});
		test("referenced dictionaries cannot be deleted", async () => {
			await validSr();
			await expect(
				connection().query("DELETE FROM departments WHERE code='SYN_HCO'"),
			).rejects.toMatchObject({ code: "23503" });
		});
		test("superadmin privilege does not create another primary actor", async () => {
			await validSr();
			await connection().query(
				"INSERT INTO system_privileges(user_id, privilege_code) VALUES ($1, 'SUPERADMIN')",
				["synthetic-sr"],
			);
			await enforce();
			await expect(
				connection().query(
					"INSERT INTO system_privileges(user_id, privilege_code) VALUES ($1, 'SUPERADMIN')",
					["synthetic-sr"],
				),
			).rejects.toMatchObject({ code: "23505" });
		});
		test("privilege grantor must reference an existing auth account", async () => {
			await validSr();
			await expect(
				connection().query(
					"INSERT INTO system_privileges(user_id, privilege_code, granted_by_user_id) VALUES ($1, 'SUPERADMIN', 'synthetic-missing-grantor')",
					["synthetic-sr"],
				),
			).rejects.toMatchObject({ code: "23503" });
		});
		test("inactive status remains independent of actor/profile consistency", async () => {
			await validSr();
			await connection().query(
				"UPDATE user_profiles SET is_active=false WHERE user_id=$1",
				["synthetic-sr"],
			);
			await enforce();
			const result = await connection().query(
				"SELECT is_active FROM user_profiles WHERE user_id=$1",
				["synthetic-sr"],
			);
			expect(result.rows[0]?.is_active).toBe(false);
		});
	},
);
