import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appRouter } from "../../routers";
import {
	archiveBroadcast,
	createBroadcast,
	updateBroadcast,
} from "./broadcast.service";

function scratchTarget(value: string) {
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/resora_test_broadcast" ||
		!url.username ||
		!url.port ||
		url.search ||
		url.hash
	)
		throw Error("EXPLICIT_EMPTY_LOOPBACK_BROADCAST_DATABASE_REQUIRED");
	return url;
}
test("broadcast integration guard refuses remote, ambiguous and existing operational database targets", () => {
	for (const value of [
		"invalid",
		"postgresql://test@remote:5432/resora_test_broadcast",
		"postgresql://test@127.0.0.1/resora_test_broadcast",
		"postgresql://test@127.0.0.1:5432/postgres",
		"postgresql://test@127.0.0.1:5432/resora_test_broadcast?host=remote",
	])
		expect(() => scratchTarget(value)).toThrow();
});

const target = process.env.RESORA_BROADCAST_TEST_DB_URL;
// Use asynchronous assertion handling for database-backed rejection paths (Bun/pg).
async function expectFailure(
	request: Promise<unknown>,
	expected?: Record<string, unknown>,
) {
	try {
		await request;
	} catch (error) {
		if (expected) expect(error).toMatchObject(expected);
		else expect(error).toBeDefined();
		return;
	}
	throw Error("Expected rejected broadcast operation");
}
(target ? describe : describe.skip)(
	"broadcast on verified disposable PostgreSQL",
	() => {
		let db: Database;
		const ids = Object.fromEntries(
			[
				"admin",
				"owner",
				"other",
				"sr",
				"inactive",
				"expired",
				"future",
				"unassigned",
				"invalid",
				"gated",
				"privileged",
			].map((key) => [key, randomUUID()]),
		);
		function caller(key = "owner") {
			return appRouter.createCaller({
				db,
				session: { user: { id: ids[key], name: "Synthetic" } } as never,
			});
		}
		const input = {
			title: "Synthetic broadcast",
			content: "Plain text\nSecond line",
		};
		beforeAll(async () => {
			const url = scratchTarget(target ?? "");
			db = createDb({ DATABASE_URL: url.href, DB_POOL_MAX: 4 });
			const { rows } =
				await db.$client.query(`SELECT current_database() name, current_user role, host(inet_server_addr()) host, inet_server_port() port,
			(SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('public','drizzle')) tables`);
			expect(rows[0]).toEqual({
				name: "resora_test_broadcast",
				role: decodeURIComponent(url.username),
				host: "127.0.0.1",
				port: Number(url.port),
				tables: 0,
			});
			await db.$client.query("SET statement_timeout='10s'");
			// Supabase-like pre-existing Data API grants must be revoked by the migration.
			await db.$client.query(
				"CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated",
			);
			const migrationsFolder = resolve(
				import.meta.dir,
				"../../../../db/src/migrations",
			);
			await migrate(db, { migrationsFolder });
			const applied = await db.$client.query(
				"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
			);
			expect(applied.rows.map((row) => row.hash)).toEqual(
				readMigrationFiles({ migrationsFolder }).map((row) => row.hash),
			);
			await seedOrganization(db);
			const periods =
				await db.$client.query(`INSERT INTO sr_periods(name, starts_on, ends_on) VALUES
			('Synthetic active',CURRENT_DATE-2,CURRENT_DATE+2), ('Synthetic expired',CURRENT_DATE-20,CURRENT_DATE-10),
			('Synthetic future',CURRENT_DATE+10,CURRENT_DATE+20) RETURNING id,name`);
			for (const [key, id] of Object.entries(ids)) {
				await db.transaction(async (tx) => {
					await tx.execute(
						sql`INSERT INTO "user"(id,name,email,username) VALUES (${id},${`Synthetic ${key}`},${`${key}@broadcast.invalid`},${`synthetic.${key}`})`,
					);
					await tx.execute(sql`INSERT INTO user_profiles(user_id,actor,is_active,must_change_password,password_reset_required)
					VALUES (${id},${key === "admin" ? "SYSTEM_ADMIN" : "SR"}::actor_type,${key !== "inactive"},false,${key === "gated"})`);
					if (["admin", "privileged"].includes(key))
						await tx.execute(
							sql`INSERT INTO system_privileges(user_id,privilege_code) VALUES (${id},'SUPERADMIN')`,
						);
					if (key !== "admin") {
						await tx.execute(sql`INSERT INTO sr_profiles(user_id,department_code,position_code,building_id)
						SELECT ${id},'HCO',${key === "invalid" ? "KETUM" : ["owner", "other"].includes(key) ? "KADEP" : "ANGGOTA"},id FROM buildings WHERE code='A'`);
						if (key !== "unassigned") {
							const period = periods.rows.find(
								(row) =>
									row.name ===
									`Synthetic ${["expired", "future"].includes(key) ? key : "active"}`,
							);
							await tx.execute(
								sql`INSERT INTO sr_period_memberships(user_id,period_id) VALUES (${id},${period.id})`,
							);
						}
					}
				});
			}
		}, 30000);
		afterAll(async () => {
			await db?.$client.end();
		});

		test("create, default seven-day expiry, shorter expiry, and ownership use server values", async () => {
			expect(await caller("sr").broadcast.latest()).toEqual([]);
			expect(await caller("sr").broadcast.list({ view: "HISTORY" })).toEqual({
				items: [],
				total: 0,
			});
			const created = await caller().broadcast.create(input);
			expect(created.expiresAt.getTime() - created.publishedAt.getTime()).toBe(
				7 * 86400000,
			);
			const row = await caller().broadcast.detail({ broadcastId: created.id });
			expect(row).toMatchObject({
				...input,
				linkUrl: null,
				creatorName: "Synthetic owner",
				status: "ACTIVE",
				canEdit: true,
				canArchive: true,
			});
			expect(Object.keys(row).sort()).toEqual(
				[
					"id",
					"title",
					"content",
					"linkUrl",
					"creatorName",
					"publishedAt",
					"expiresAt",
					"archivedAt",
					"status",
					"canEdit",
					"canArchive",
				].sort(),
			);
			const clock = await db.$client.query(
				"SELECT clock_timestamp()+interval '1 hour' expiry",
			);
			const short = await caller().broadcast.create({
				...input,
				linkUrl: "https://example.invalid/info",
				expiresAt: clock.rows[0].expiry.toISOString(),
			});
			expect(short.expiresAt).toEqual(clock.rows[0].expiry);
			for (const offset of ["-1 hour", "8 days"]) {
				const clock = await db.$client.query(
					"SELECT clock_timestamp()+$1::interval expiry",
					[offset],
				);
				await expectFailure(
					caller().broadcast.create({
						...input,
						expiresAt: clock.rows[0].expiry.toISOString(),
					}),
					{ code: "BAD_REQUEST" },
				);
			}
			for (const key of ["admin", "privileged"])
				expect((await caller(key).broadcast.create(input)).id).toBeDefined();
		});

		test("ownership, current role and SUPERADMIN override protect update/archive", async () => {
			const created = await caller().broadcast.create(input);
			await expectFailure(
				caller("other").broadcast.update({ ...input, broadcastId: created.id }),
				{
					code: "FORBIDDEN",
					message: "BROADCAST_NOT_OWNER",
				},
			);
			await expectFailure(
				caller("other").broadcast.archive({ broadcastId: created.id }),
				{ code: "FORBIDDEN" },
			);
			await caller().broadcast.update({
				...input,
				broadcastId: created.id,
				title: "Updated",
			});
			let row = await caller().broadcast.detail({ broadcastId: created.id });
			expect(row.title).toBe("Updated");
			expect(row.publishedAt).toEqual(created.publishedAt);
			expect(row.expiresAt).toEqual(created.expiresAt);
			const beyond = new Date(
				created.publishedAt.getTime() + 7 * 86400000 + 1,
			).toISOString();
			await expectFailure(
				caller().broadcast.update({
					...input,
					broadcastId: created.id,
					expiresAt: beyond,
				}),
				{
					message: "BROADCAST_EXPIRATION_EXCEEDS_SEVEN_DAYS",
				},
			);
			await caller("admin").broadcast.update({
				...input,
				broadcastId: created.id,
				title: "Admin updated",
			});
			await caller("admin").broadcast.archive({ broadcastId: created.id });
			row = await caller().broadcast.detail({ broadcastId: created.id });
			expect(row).toMatchObject({
				status: "HISTORY",
				canEdit: false,
				canArchive: false,
				title: "Admin updated",
			});
			await expectFailure(
				caller().broadcast.archive({ broadcastId: created.id }),
				{
					code: "CONFLICT",
					message: "BROADCAST_ALREADY_ARCHIVED",
				},
			);
			await expectFailure(
				caller().broadcast.update({ ...input, broadcastId: created.id }),
				{ code: "CONFLICT" },
			);
			const own = await caller().broadcast.create(input);
			await caller().broadcast.archive({ broadcastId: own.id });
			expect(
				(await caller("sr").broadcast.detail({ broadcastId: own.id })).status,
			).toBe("HISTORY");
		});

		test("reads reject ineligible/invalid identities and mandatory rotation without granting committee authority", async () => {
			for (const key of [
				"inactive",
				"expired",
				"future",
				"unassigned",
				"invalid",
				"gated",
			]) {
				for (const action of [
					() => caller(key).broadcast.list({}),
					() => caller(key).broadcast.latest(),
					() => caller(key).broadcast.detail({ broadcastId: randomUUID() }),
					() => caller(key).broadcast.create(input),
				])
					await expectFailure(action(), {
						code: ["invalid", "gated"].includes(key)
							? "FORBIDDEN"
							: "UNAUTHORIZED",
					});
			}
			await expectFailure(caller("sr").broadcast.create(input), {
				code: "FORBIDDEN",
			});
			expect(
				(await caller("sr").broadcast.list({})).items.length,
			).toBeGreaterThan(0);
			await db.$client.query(
				"UPDATE user_profiles SET must_change_password=true WHERE user_id=$1",
				[ids.admin],
			);
			try {
				await expectFailure(caller("admin").broadcast.latest(), {
					message: "PASSWORD_CHANGE_REQUIRED",
				});
			} finally {
				await db.$client.query(
					"UPDATE user_profiles SET must_change_password=false WHERE user_id=$1",
					[ids.admin],
				);
			}
		});

		test("live checks reject demotion, deactivation and revoked grants before writes", async () => {
			const owner = await getActiveIdentity(db, ids.owner ?? "");
			const admin = await getActiveIdentity(db, ids.admin ?? "");
			if (!owner || !admin) throw Error("Missing fixture identity");
			const created = await caller().broadcast.create(input);
			await db.$client.query(
				"UPDATE sr_profiles SET position_code='ANGGOTA' WHERE user_id=$1",
				[ids.owner],
			);
			try {
				await expectFailure(updateBroadcast(db, owner, created.id, input), {
					code: "FORBIDDEN",
				});
				await expectFailure(archiveBroadcast(db, owner, created.id), {
					code: "FORBIDDEN",
				});
				expect(
					(await caller().broadcast.detail({ broadcastId: created.id }))
						.canEdit,
				).toBe(false);
			} finally {
				await db.$client.query(
					"UPDATE sr_profiles SET position_code='KADEP' WHERE user_id=$1",
					[ids.owner],
				);
			}
			await db.$client.query("DELETE FROM system_privileges WHERE user_id=$1", [
				ids.admin,
			]);
			try {
				await expectFailure(createBroadcast(db, admin, input), {
					code: "FORBIDDEN",
				});
			} finally {
				await db.$client.query(
					"INSERT INTO system_privileges(user_id,privilege_code) VALUES ($1,'SUPERADMIN')",
					[ids.admin],
				);
			}
			await db.$client.query(
				"UPDATE user_profiles SET is_active=false WHERE user_id=$1",
				[ids.owner],
			);
			try {
				await expectFailure(createBroadcast(db, owner, input), {
					code: "FORBIDDEN",
				});
				// Creator deactivation must not hide their history/content from other eligible SR.
				expect(
					(await caller("sr").broadcast.detail({ broadcastId: created.id }))
						.title,
				).toBe(input.title);
			} finally {
				await db.$client.query(
					"UPDATE user_profiles SET is_active=true WHERE user_id=$1",
					[ids.owner],
				);
			}
		});

		test("active/history, latest three, deterministic ties and empty offset follow database timestamps", async () => {
			const created = await Promise.all(
				Array.from({ length: 5 }, () => caller().broadcast.create(input)),
			);
			const ids = created.map((row) => row.id);
			await db.$client.query(
				"UPDATE broadcasts SET published_at=now()-interval '2 hours',expires_at=now()+interval '2 hours' WHERE id=ANY($1::uuid[])",
				[ids],
			);
			const all = await caller("sr").broadcast.list({ limit: 50 });
			const page = await caller("sr").broadcast.list({ limit: 2, offset: 1 });
			expect(page.items.map((r) => r.id)).toEqual(
				all.items.slice(1, 3).map((r) => r.id),
			);
			expect(page.total).toBe(all.total);
			expect((await caller().broadcast.latest()).map((r) => r.id)).toEqual(
				all.items.slice(0, 3).map((r) => r.id),
			);
			expect(
				all.items.filter((r) => ids.includes(r.id)).map((r) => r.id),
			).toEqual([...ids].sort().reverse());
			const empty = await caller().broadcast.list({ offset: 999 });
			expect(empty.items).toEqual([]);
			expect(empty.total).toBe(all.total);
			const expired = created[0];
			if (!expired) throw Error("Missing fixture");
			await db.$client.query(
				"UPDATE broadcasts SET published_at=now()-interval '1 day',expires_at=now() WHERE id=$1",
				[expired.id],
			);
			expect(
				(await caller().broadcast.list({ limit: 50 })).items.some(
					(r) => r.id === expired.id,
				),
			).toBe(false);
			const history = await caller().broadcast.list({
				view: "HISTORY",
				limit: 50,
			});
			expect(history.items.some((r) => r.id === expired.id)).toBe(true);
			expect(
				history.items.every(
					(r) => r.status === "HISTORY" && !r.canEdit && !r.canArchive,
				),
			).toBe(true);
			await expectFailure(
				caller().broadcast.update({ ...input, broadcastId: expired.id }),
				{ message: "BROADCAST_EXPIRED" },
			);
			await expectFailure(
				caller().broadcast.archive({ broadcastId: expired.id }),
				{ message: "BROADCAST_EXPIRED" },
			);
		});

		test("database expiry, text, URL, FK, RLS and Data API restrictions hold", async () => {
			const insert = `INSERT INTO broadcasts(title,content,created_by_user_id,published_at,expires_at,link_url) VALUES ($1,$2,$3,'2026-01-01T00:00:00Z',$4,$5)`;
			for (const values of [
				[" ", "Text", ids.owner, "2026-01-02T00:00:00Z", null],
				["Title", " ", ids.owner, "2026-01-02T00:00:00Z", null],
				["Title", "Text", ids.owner, "2026-01-01T00:00:00Z", null],
				["Title", "Text", ids.owner, "2026-01-08T00:00:00.001Z", null],
				[
					"Title",
					"Text",
					ids.owner,
					"2026-01-02T00:00:00Z",
					"javascript:alert(1)",
				],
				["Title", "Text", "missing-user", "2026-01-02T00:00:00Z", null],
			])
				await expectFailure(db.$client.query(insert, values));
			await db.$client.query(insert, [
				"Title",
				"Text",
				ids.owner,
				"2026-01-08T00:00:00Z",
				null,
			]);
			const metadata = await db.$client.query(
				"SELECT relrowsecurity FROM pg_class WHERE oid='public.broadcasts'::regclass",
			);
			expect(metadata.rows[0].relrowsecurity).toBe(true);
			for (const role of ["anon", "authenticated"]) {
				const client = await db.$client.connect();
				try {
					await client.query(`SET ROLE ${role}`);
					for (const statement of [
						"SELECT * FROM broadcasts",
						"UPDATE broadcasts SET title='bad'",
						"DELETE FROM broadcasts",
						"TRUNCATE broadcasts",
						insert,
					])
						await expectFailure(
							client.query(
								statement,
								statement === insert
									? ["X", "X", ids.owner, "2026-01-02T00:00:00Z", null]
									: [],
							),
							{ code: "42501" },
						);
				} finally {
					await client.query("RESET ROLE");
					client.release();
				}
			}
			const client = await db.$client.connect();
			try {
				await client.query("BEGIN");
				await client.query("GRANT SELECT ON broadcasts TO anon");
				await client.query("SET LOCAL ROLE anon");
				// Even an accidental SELECT grant cannot expose rows without an RLS policy.
				expect((await client.query("SELECT id FROM broadcasts")).rows).toEqual(
					[],
				);
			} finally {
				await client.query("ROLLBACK");
				client.release();
			}
			await expectFailure(
				db.$client.query('DELETE FROM "user" WHERE id=$1', [ids.owner]),
				{ code: "23503" },
			);
		});

		test("write failure rolls back, and concurrent archive/update cannot reactivate a broadcast", async () => {
			const created = await caller().broadcast.create(input);
			await db.$client.query(`CREATE FUNCTION reject_synthetic_broadcast() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
			CREATE TRIGGER reject_synthetic_broadcast AFTER INSERT OR UPDATE ON broadcasts FOR EACH ROW EXECUTE FUNCTION reject_synthetic_broadcast()`);
			try {
				await expectFailure(
					caller().broadcast.update({
						...input,
						broadcastId: created.id,
						title: "Should rollback",
					}),
					{ code: "INTERNAL_SERVER_ERROR" },
				);
				await expectFailure(
					caller().broadcast.create({ ...input, title: "Should not exist" }),
					{ code: "INTERNAL_SERVER_ERROR" },
				);
			} finally {
				await db.$client.query(
					"DROP TRIGGER reject_synthetic_broadcast ON broadcasts; DROP FUNCTION reject_synthetic_broadcast()",
				);
			}
			expect(
				(await caller().broadcast.detail({ broadcastId: created.id })).title,
			).toBe(input.title);
			const count = await db.$client.query(
				"SELECT count(*)::int count FROM broadcasts WHERE title='Should not exist'",
			);
			expect(count.rows[0].count).toBe(0);
			const outcomes = await Promise.allSettled([
				caller().broadcast.archive({ broadcastId: created.id }),
				caller().broadcast.update({
					...input,
					broadcastId: created.id,
					title: "Concurrent edit",
				}),
			]);
			expect(outcomes[0]?.status).toBe("fulfilled");
			expect(
				(await caller().broadcast.detail({ broadcastId: created.id })).status,
			).toBe("HISTORY");
			await expectFailure(
				caller().broadcast.detail({ broadcastId: randomUUID() }),
				{ code: "NOT_FOUND" },
			);
		});
	},
);
