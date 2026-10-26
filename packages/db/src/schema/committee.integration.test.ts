import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { createDb, type Database } from "../index";
import { seedOrganization } from "../organization";
import { committeePositionCodes } from "./committee";

function scratchTarget(value: string) {
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/resora_identity_test_committees" ||
		!url.username ||
		!url.port ||
		url.search ||
		url.hash
	)
		throw Error("EXPLICIT_EMPTY_LOOPBACK_COMMITTEE_DATABASE_REQUIRED");
	return url;
}

test("committee PostgreSQL suite refuses remote, ambiguous and ordinary application targets", () => {
	for (const value of [
		"postgresql://operator@remote.invalid:5432/resora_identity_test_committees",
		"postgresql://operator@127.0.0.1:5432/resora",
		"postgresql://operator@127.0.0.1/resora_identity_test_committees",
		"postgresql://operator@127.0.0.1:5432/resora_identity_test_committees?host=remote",
		"postgresql://operator@127.0.0.1:5432/resora_identity_test_committees#override",
		"invalid",
	])
		expect(() => scratchTarget(value)).toThrow();
});

// No application env fallback. This suite migrates only a verified EMPTY scratch DB.
const target = process.env.RESORA_COMMITTEE_TEST_DB_URL;
(target ? describe : describe.skip)(
	"committee constraints on isolated PostgreSQL",
	() => {
		let db: Database;
		let client: PoolClient | undefined;
		const sr = randomUUID();
		const admin = randomUUID();
		const first = randomUUID();
		const second = randomUUID();
		const division = randomUUID();
		const otherDivision = randomUUID();
		beforeAll(async () => {
			const url = scratchTarget(target ?? "");
			db = createDb({ DATABASE_URL: url.href, DB_POOL_MAX: 1 });
			const result =
				await db.$client.query(`SELECT current_database() AS name, current_user AS role,
			host(inet_server_addr()) AS host, inet_server_port() AS port,
			(SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('public','drizzle')) AS tables`);
			expect(result.rows[0]).toEqual({
				name: "resora_identity_test_committees",
				role: decodeURIComponent(url.username),
				host: "127.0.0.1",
				port: Number(url.port),
				tables: 0,
			});
			await migrate(db, {
				migrationsFolder: resolve(import.meta.dir, "../migrations"),
			});
			await seedOrganization(db);
		}, 30000);
		beforeEach(async () => {
			client = await db.$client.connect();
			await client.query("BEGIN");
			await client.query(
				`INSERT INTO "user" (id,name,email,username) VALUES
			($1,'Synthetic SR','sr@committee.invalid','000012345'),
			($2,'Synthetic Admin','admin@committee.invalid','committee.admin')`,
				[sr, admin],
			);
			await client.query(
				`INSERT INTO user_profiles(user_id,actor,must_change_password) VALUES ($1,'SR',false),($2,'SYSTEM_ADMIN',false)`,
				[sr, admin],
			);
			await client.query(
				`INSERT INTO sr_profiles(user_id,department_code,position_code,building_id)
			SELECT $1,'RND','ANGGOTA',id FROM buildings WHERE code='A'`,
				[sr],
			);
			await client.query(
				`INSERT INTO system_privileges(user_id,privilege_code) VALUES ($1,'SUPERADMIN')`,
				[admin],
			);
			await client.query(
				`INSERT INTO committees(id,name,created_by_user_id) VALUES ($1,'Synthetic Welday',$3),($2,'Synthetic Evaluation',$3)`,
				[first, second, admin],
			);
			await client.query(
				`INSERT INTO committee_divisions(id,committee_id,name) VALUES ($1,$2,'Acara'),($3,$4,'Acara')`,
				[division, first, otherDivision, second],
			);
			await client.query("SET CONSTRAINTS ALL IMMEDIATE");
		});
		afterEach(async () => {
			if (client) {
				await client.query("ROLLBACK");
				client.release();
				client = undefined;
			}
		});
		afterAll(async () => {
			await db?.$client.end();
		});
		function connection() {
			if (!client) throw Error("SCRATCH_TRANSACTION_REQUIRED");
			return client;
		}
		async function rejected(query: string, values: unknown[], code: string) {
			await connection().query("SAVEPOINT invalid_input");
			let actual: unknown;
			try {
				await connection().query(query, values);
			} catch (error) {
				actual = (error as { code?: string }).code;
			} finally {
				await connection().query("ROLLBACK TO SAVEPOINT invalid_input");
				await connection().query("RELEASE SAVEPOINT invalid_input");
			}
			expect(actual).toBe(code);
		}
		const insertMember =
			"INSERT INTO committee_members(committee_id,user_id,division_id,position_code) VALUES ($1,$2,$3,$4)";
		test("committees support dynamic divisions and the same normalized name across committees", async () => {
			await connection().query(
				"INSERT INTO committee_divisions(committee_id,name) VALUES ($1,'Konsumsi')",
				[first],
			);
			expect(
				(
					await connection().query(
						"SELECT count(*)::int n FROM committee_divisions",
					)
				).rows[0].n,
			).toBe(3);
			const row = (
				await connection().query(
					"SELECT description,created_at,updated_at FROM committees WHERE id=$1",
					[first],
				)
			).rows[0];
			expect(row.description).toBe("");
			expect(row.created_at).toBeInstanceOf(Date);
			expect(row.updated_at).toBeInstanceOf(Date);
			for (const name of ["ACARA", " acara ", "Acara"])
				await rejected(
					"INSERT INTO committee_divisions(committee_id,name) VALUES ($1,$2)",
					[first, name],
					"23505",
				);
		});
		test("blank names and missing creator/division references fail at the database boundary", async () => {
			for (const name of ["", "   "]) {
				await rejected(
					"INSERT INTO committees(name,created_by_user_id) VALUES ($1,$2)",
					[name, admin],
					"23514",
				);
				await rejected(
					"INSERT INTO committee_divisions(committee_id,name) VALUES ($1,$2)",
					[first, name],
					"23514",
				);
			}
			await rejected(
				"INSERT INTO committees(name,created_by_user_id) VALUES ('Invalid',$1)",
				[randomUUID()],
				"23503",
			);
			await rejected(
				"INSERT INTO committee_divisions(committee_id,name) VALUES ($1,'Invalid')",
				[randomUUID()],
				"23503",
			);
		});
		test("one SR may join multiple committees but only once per committee", async () => {
			await connection().query(insertMember, [first, sr, division, "KADEP"]);
			await connection().query(insertMember, [
				second,
				sr,
				otherDivision,
				"ANGGOTA",
			]);
			expect(
				(
					await connection().query(
						"SELECT count(*)::int n FROM committee_members WHERE user_id=$1",
						[sr],
					)
				).rows[0].n,
			).toBe(2);
			await rejected(insertMember, [first, sr, division, "PIC1"], "23505");
		});
		test("only approved positions and nonnull division are accepted", async () => {
			await connection().query(insertMember, [first, sr, division, "ANGGOTA"]);
			for (const position of committeePositionCodes)
				await connection().query(
					"UPDATE committee_members SET position_code=$1 WHERE committee_id=$2 AND user_id=$3",
					[position, first, sr],
				);
			for (const position of ["KETUM", "SEKRETARIS", "anggota", ""])
				await rejected(
					"UPDATE committee_members SET position_code=$1 WHERE committee_id=$2 AND user_id=$3",
					[position, first, sr],
					"23514",
				);
			await rejected(
				"UPDATE committee_members SET division_id=NULL WHERE committee_id=$1",
				[first],
				"23502",
			);
		});
		test("cross-committee division, missing SR and dedicated admin membership are rejected", async () => {
			await rejected(
				insertMember,
				[first, sr, otherDivision, "ANGGOTA"],
				"23503",
			);
			await rejected(
				insertMember,
				[first, randomUUID(), division, "ANGGOTA"],
				"23503",
			);
			await rejected(
				insertMember,
				[first, admin, division, "ANGGOTA"],
				"23503",
			);
			await connection().query(insertMember, [first, sr, division, "ANGGOTA"]);
			await rejected(
				"UPDATE committee_members SET division_id=$1 WHERE committee_id=$2",
				[otherDivision, first],
				"23503",
			);
		});
		test("referenced committees, divisions, SR profiles and creators cannot be deleted", async () => {
			await connection().query(insertMember, [first, sr, division, "ANGGOTA"]);
			await rejected(
				"DELETE FROM committee_divisions WHERE id=$1",
				[division],
				"23503",
			);
			await rejected("DELETE FROM committees WHERE id=$1", [first], "23503");
			await rejected("DELETE FROM sr_profiles WHERE user_id=$1", [sr], "23503");
			await rejected('DELETE FROM "user" WHERE id=$1', [admin], "23503");
			expect(
				(
					await connection().query(
						"SELECT count(*)::int n FROM committee_members",
					)
				).rows[0].n,
			).toBe(1);
		});
		test("new tables are server-only and all five FKs retain NO ACTION deletion", async () => {
			const tables = ["committees", "committee_divisions", "committee_members"];
			const result = await connection().query(
				"SELECT relrowsecurity FROM pg_class WHERE relname=ANY($1::text[]) AND relnamespace='public'::regnamespace",
				[tables],
			);
			expect(result.rows).toHaveLength(3);
			expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
			const fks = await connection().query(
				"SELECT confdeltype FROM pg_constraint WHERE contype='f' AND conrelid IN (SELECT oid FROM pg_class WHERE relname=ANY($1::text[]) AND relnamespace='public'::regnamespace)",
				[tables],
			);
			expect(fks.rows).toHaveLength(5);
			expect(fks.rows.every((r) => r.confdeltype === "a")).toBe(true);
			const grants = await connection().query(
				"SELECT a.privilege_type FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE c.relname=ANY($1::text[]) AND (a.grantee=0 OR r.rolname IN ('anon','authenticated'))",
				[tables],
			);
			expect(grants.rows).toHaveLength(0);
		});
	},
);
