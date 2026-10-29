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
import { manualInsert } from "../attendance/manual-attendance";
import { setAccountPermission } from "./account-permissions";

export function permissionScratchTarget(value: string) {
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/resora_identity_test_permissions" ||
		!url.port ||
		!url.username ||
		url.search ||
		url.hash
	)
		throw new Error("EMPTY_LOOPBACK_PERMISSION_DATABASE_REQUIRED");
	return url;
}
test("permission integration target rejects remote, ambiguous and operational databases", () => {
	for (const url of [
		"postgresql://test@remote:5432/resora_identity_test_permissions",
		"postgresql://test@127.0.0.1:5432/postgres",
		"postgresql://test@127.0.0.1/resora_identity_test_permissions",
		"postgresql://test@127.0.0.1:5432/resora_identity_test_permissions?host=remote",
	])
		expect(() => permissionScratchTarget(url)).toThrow();
});
async function rejected(promise: Promise<unknown>, message?: string) {
	try {
		await promise;
	} catch (error) {
		if (message) {
			const messages: string[] = [];
			let current = error;
			for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
				messages.push(current.message);
				current = current.cause;
			}
			expect(messages.join(" ")).toContain(message);
		} else expect(error).toBeDefined();
		return;
	}
	throw new Error("Expected rejected permission operation");
}
const target = process.env.RESORA_PERMISSION_TEST_DB_URL;
(target ? describe : describe.skip)(
	"permission grants on verified disposable PostgreSQL",
	() => {
		let db: Database;
		const ids = Object.fromEntries(
			[
				"admin",
				"privileged",
				"member",
				"sekdep",
				"kadep",
				"nonhco",
				"inactive",
				"expired",
				"scheduled",
				"unassigned",
				"gated",
				"invalid",
				"participant",
				"race",
				"rollback",
			].map((key) => [key, randomUUID()]),
		);
		const caller = (key = "admin") =>
			appRouter.createCaller({
				db,
				session: { user: { id: ids[key], name: "Synthetic" } } as never,
			});
		const set = (key: string, enabled: boolean) =>
			caller().identity.setAccountPermission({
				userId: ids[key] as string,
				permissionCode: "ATTENDANCE_MANUAL_MANAGE",
				enabled,
			});
		const permissions = (key: string) =>
			caller().identity.accountPermissions({ userId: ids[key] as string });
		const identity = async (key: string) => {
			const live = await getActiveIdentity(db, ids[key] as string);
			if (!live) throw new Error("Synthetic active identity required");
			return live;
		};
		beforeAll(async () => {
			const url = permissionScratchTarget(target ?? "");
			db = createDb({ DATABASE_URL: url.href, DB_POOL_MAX: 6 });
			const { rows } =
				await db.$client.query(`SELECT current_database() name, current_user role, host(inet_server_addr()) host, inet_server_port() port,
		(SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('public','drizzle')) tables`);
			expect(rows[0]).toEqual({
				name: "resora_identity_test_permissions",
				role: decodeURIComponent(url.username),
				host: "127.0.0.1",
				port: Number(url.port),
				tables: 0,
			});
			await db.$client.query(
				"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated",
			);
			const migrationsFolder = resolve(
				import.meta.dir,
				"../../../../db/src/migrations",
			);
			await migrate(db, { migrationsFolder });
			const history = await db.$client.query(
				"SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
			);
			expect(history.rows.map((row) => row.hash)).toEqual(
				readMigrationFiles({ migrationsFolder }).map((row) => row.hash),
			);
			await seedOrganization(db);
			const periods = await db.$client.query(
				`INSERT INTO sr_periods(name,starts_on,ends_on) VALUES ('Synthetic active',CURRENT_DATE-2,CURRENT_DATE+2),('Synthetic expired',CURRENT_DATE-20,CURRENT_DATE-10),('Synthetic scheduled',CURRENT_DATE+10,CURRENT_DATE+20) RETURNING id,name`,
			);
			for (const [key, id] of Object.entries(ids))
				await db.transaction(async (tx) => {
					await tx.execute(
						sql`INSERT INTO "user"(id,name,email,username) VALUES (${id},${`Synthetic ${key}`},${`${key}@permission.invalid`},${`permission.${key}`})`,
					);
					await tx.execute(
						sql`INSERT INTO user_profiles(user_id,actor,is_active,must_change_password,password_reset_required) VALUES (${id},${key === "admin" ? "SYSTEM_ADMIN" : "SR"}::actor_type,${key !== "inactive"},false,${key === "gated"})`,
					);
					if (["admin", "privileged"].includes(key))
						await tx.execute(
							sql`INSERT INTO system_privileges(user_id,privilege_code) VALUES (${id},'SUPERADMIN')`,
						);
					if (key !== "admin") {
						await tx.execute(
							sql`INSERT INTO sr_profiles(user_id,department_code,position_code,building_id) SELECT ${id},${key === "nonhco" ? "RND" : "HCO"},${key === "kadep" ? "KADEP" : key === "sekdep" ? "SEKDEP" : key === "invalid" ? "KETUM" : "ANGGOTA"},id FROM buildings WHERE code='A'`,
						);
						if (key !== "unassigned") {
							const period = periods.rows.find(
								(row) =>
									row.name ===
									`Synthetic ${["expired", "scheduled"].includes(key) ? key : "active"}`,
							);
							await tx.execute(
								sql`INSERT INTO sr_period_memberships(user_id,period_id) VALUES (${id},${period.id})`,
							);
						}
					}
				});
		}, 30000);
		afterAll(async () => {
			await db?.$client.end();
		});
		async function event() {
			const created = await caller("kadep").attendance.create({
				title: "Synthetic permission event",
				description: "",
				startsAt: new Date(Date.now() - 60000).toISOString(),
				endsAt: new Date(Date.now() + 3600000).toISOString(),
				rosterCriteria: { individuals: [ids.participant as string] },
				session: { centerLat: 0, centerLng: 0 },
			});
			await caller("kadep").attendance.publish({ eventId: created.eventId });
			return created.eventId;
		}
		const manualInput = (eventId: string) => ({
			eventId,
			userId: ids.participant as string,
			reason: "Synthetic manual verification",
		});
		test("catalog/admin API is protected; grant/revoke/regrant are audited and idempotent", async () => {
			expect(await caller().identity.permissionCatalog()).toHaveLength(1);
			expect((await permissions("member")).catalog[0]?.category).toBe("HCO");
			expect((await permissions("nonhco")).catalog).toEqual([]);
			expect((await permissions("inactive")).catalog[0]?.category).toBe("HCO");
			for (const key of ["member", "sekdep", "kadep", "nonhco"]) {
				await rejected(
					caller(key).identity.permissionCatalog(),
					"SUPERADMIN_REQUIRED",
				);
				await rejected(
					caller(key).identity.setAccountPermission({
						userId: ids.member as string,
						permissionCode: "ATTENDANCE_MANUAL_MANAGE",
						enabled: false,
					}),
					"SUPERADMIN_REQUIRED",
				);
			}
			await rejected(set("kadep", true), "PERMISSION_ALREADY_INTRINSIC");
			for (const key of [
				"nonhco",
				"inactive",
				"expired",
				"scheduled",
				"unassigned",
				"gated",
				"invalid",
			])
				await rejected(set(key, true), "PERMISSION_TARGET_INELIGIBLE");
			expect((await set("member", true)).changed).toBe(true);
			expect((await set("member", true)).changed).toBe(false);
			expect((await set("member", false)).changed).toBe(true);
			expect((await set("member", false)).changed).toBe(false);
			expect((await set("member", true)).changed).toBe(true);
			const audits = await db.execute<{
				action: string;
				details: Record<string, unknown>;
				actor_user_id: string;
			}>(
				sql`SELECT action,details,actor_user_id FROM account_audit_logs WHERE target_user_id=${ids.member} ORDER BY created_at,id`,
			);
			expect(audits.rows.map((row) => row.action)).toEqual([
				"ACCOUNT_PERMISSION_GRANTED",
				"ACCOUNT_PERMISSION_REVOKED",
				"ACCOUNT_PERMISSION_GRANTED",
			]);
			expect(audits.rows.every((row) => row.actor_user_id === ids.admin)).toBe(
				true,
			);
			expect(audits.rows[0]?.details).toEqual({
				permissionCode: "ATTENDANCE_MANUAL_MANAGE",
				before: { active: false },
				after: { active: true },
			});
			expect((await permissions("member")).permission).toMatchObject({
				intrinsic: false,
				explicit: true,
				effective: true,
			});
		});
		test("session/recap/manual insert/correction/audit honor grants without expanding other capabilities", async () => {
			const before = await caller("sekdep").identity.session();
			const first = await event();
			await rejected(
				caller("sekdep").attendance.manualInsert(manualInput(first)),
				"MANUAL_ACCESS_REQUIRED",
			);
			await set("sekdep", true);
			const after = await caller("sekdep").identity.session();
			if (!before || !after) throw new Error("Synthetic sessions required");
			expect(after).toEqual({
				...before,
				canManageInternalAttendanceManually: true,
			});
			expect(after).toMatchObject({
				canManageInternalEvents: true,
				canManageCommittee: true,
				canManageBroadcast: false,
				isSuperadmin: false,
			});
			for (const request of [
				() =>
					caller("member").attendance.setVisibility({
						eventId: first,
						action: "HIDE",
						reason: "Must remain denied",
					}),
				() =>
					caller("member").attendance.deleteDraft({
						eventId: first,
						reason: "Must remain denied",
					}),
				() =>
					caller("member").attendance.advancedEdit({
						eventId: first,
						mode: "LIMITED",
						title: "Denied",
						description: "",
						reason: "Must remain denied",
					}),
			])
				await rejected(request(), "FORBIDDEN");
			const created = await caller("sekdep").attendance.manualInsert(
				manualInput(first),
			);
			await caller("sekdep").attendance.manualCorrect({
				attendanceId: created.attendanceId,
				attendanceAt: new Date(Date.now() - 1000).toISOString(),
				reason: "Synthetic correction",
			});
			expect(
				(await caller("sekdep").attendance.recap({ eventId: first })).canManual,
			).toBe(true);
			const history = await caller("sekdep").attendance.auditHistory({
				eventId: first,
				userId: ids.participant as string,
			});
			expect(history.items).toHaveLength(2);
			expect(
				history.items.every((row) => row.operator === "Synthetic sekdep"),
			).toBe(true);
			await rejected(
				caller("sekdep").attendance.manualInsert(manualInput(first)),
				"ATTENDANCE_ALREADY_RECORDED",
			);
			await set("sekdep", false);
			expect(
				(await caller("sekdep").identity.session())
					?.canManageInternalAttendanceManually,
			).toBe(false);
			expect(
				(await caller("sekdep").attendance.recap({ eventId: first })).canManual,
			).toBe(false);
			await rejected(
				caller("sekdep").attendance.manualCorrect({
					attendanceId: created.attendanceId,
					attendanceAt: new Date().toISOString(),
					reason: "Denied correction",
				}),
				"MANUAL_ACCESS_REQUIRED",
			);
			await rejected(
				caller("sekdep").attendance.auditHistory({
					eventId: first,
					userId: ids.participant as string,
				}),
			);
			for (const key of ["admin", "kadep", "member"]) {
				const next = await event();
				expect(
					(await caller(key).attendance.manualInsert(manualInput(next)))
						.attendanceId,
				).toBeString();
			}
			const draft = await caller("kadep").attendance.create({
				title: "Synthetic draft",
				startsAt: new Date().toISOString(),
				endsAt: new Date(Date.now() + 3600000).toISOString(),
				rosterCriteria: { individuals: [ids.participant as string] },
				session: { centerLat: 0, centerLng: 0 },
			});
			await rejected(
				caller("member").attendance.manualInsert(manualInput(draft.eventId)),
				"NOT_INVITED", // DRAFT has no published invitation snapshot; preserve existing validation order.
			);
		});
		test("department/lifecycle changes block effective use; grants revive only when eligible again and may be revoked while ineligible", async () => {
			const stale = await identity("member");
			const next = await event();
			await db.execute(
				sql`UPDATE sr_profiles SET department_code='RND' WHERE user_id=${ids.member}`,
			);
			expect((await permissions("member")).permission).toMatchObject({
				explicit: true,
				effective: false,
			});
			const outside = await permissions("member");
			expect(outside.catalog).toEqual([]);
			expect(outside.permission.label).toBe("Input & Koreksi Absensi Manual");
			await rejected(set("member", true), "PERMISSION_TARGET_INELIGIBLE");
			await rejected(
				manualInsert(db, stale, manualInput(next)),
				"MANUAL_ACCESS_REQUIRED",
			);
			await db.execute(
				sql`UPDATE sr_profiles SET department_code='HCO' WHERE user_id=${ids.member}`,
			);
			await set("member", true);
			await db.execute(
				sql`UPDATE sr_period_memberships SET period_id=(SELECT id FROM sr_periods WHERE name='Synthetic expired') WHERE user_id=${ids.member}`,
			);
			expect((await permissions("member")).permission.effective).toBe(false);
			await rejected(
				manualInsert(db, stale, manualInput(next)),
				"MANUAL_ACCESS_REQUIRED",
			);
			expect((await set("member", false)).changed).toBe(true);
			await db.execute(
				sql`UPDATE sr_period_memberships SET period_id=(SELECT id FROM sr_periods WHERE name='Synthetic active') WHERE user_id=${ids.member}`,
			);
			await set("member", true);
			await db.execute(
				sql`UPDATE user_profiles SET password_reset_required=true WHERE user_id=${ids.member}`,
			);
			expect((await permissions("member")).permission.effective).toBe(false);
			expect((await set("member", false)).changed).toBe(true);
			await db.execute(
				sql`UPDATE user_profiles SET password_reset_required=false WHERE user_id=${ids.member}`,
			);
			expect((await permissions("member")).permission.effective).toBe(false);
			await set("member", true);
			expect((await permissions("member")).permission.effective).toBe(true);
			await db.execute(
				sql`UPDATE user_profiles SET is_active=false WHERE user_id=${ids.member}`,
			);
			expect((await permissions("member")).permission.effective).toBe(false);
			expect((await set("member", false)).changed).toBe(true);
			await db.execute(
				sql`UPDATE user_profiles SET is_active=true WHERE user_id=${ids.member}`,
			);
			expect((await permissions("member")).permission.effective).toBe(false);
			await set("member", true);
			await db.execute(
				sql`UPDATE sr_profiles SET department_code='RND' WHERE user_id=${ids.member}`,
			);
			expect((await set("member", false)).changed).toBe(true);
			await db.execute(
				sql`UPDATE sr_profiles SET department_code='HCO' WHERE user_id=${ids.member}`,
			);
			const admin = await identity("privileged");
			await db.execute(
				sql`DELETE FROM system_privileges WHERE user_id=${ids.privileged}`,
			);
			await rejected(
				setAccountPermission(db, admin, {
					userId: ids.member as string,
					permissionCode: "ATTENDANCE_MANUAL_MANAGE",
					enabled: true,
				}),
				"SUPERADMIN_REQUIRED",
			);
		});
		test("migration enforces code/PK/FKs/revocation consistency, server-only access and immutable account audits", async () => {
			const result = await db.execute<{ rls: boolean; allowed: boolean }>(
				sql`SELECT relrowsecurity rls, has_table_privilege('anon','user_permission_grants','SELECT') OR has_table_privilege('authenticated','user_permission_grants','INSERT') allowed FROM pg_class WHERE oid='user_permission_grants'::regclass`,
			);
			expect(result.rows[0]).toEqual({ rls: true, allowed: false });
			await rejected(
				db.execute(
					sql`INSERT INTO user_permission_grants(user_id,permission_code,granted_by_user_id) VALUES (${ids.participant},'SUPERADMIN',${ids.admin})`,
				),
			);
			await rejected(
				db.execute(
					sql`INSERT INTO user_permission_grants(user_id,permission_code,granted_by_user_id) VALUES ('missing-user','ATTENDANCE_MANUAL_MANAGE',${ids.admin})`,
				),
			);
			await rejected(
				db.execute(
					sql`INSERT INTO user_permission_grants(user_id,permission_code,granted_by_user_id,revoked_by_user_id) VALUES (${ids.participant},'ATTENDANCE_MANUAL_MANAGE',${ids.admin},${ids.admin})`,
				),
			);
			await set("member", true);
			await rejected(
				db.execute(
					sql`INSERT INTO user_permission_grants(user_id,permission_code,granted_by_user_id) VALUES (${ids.member},'ATTENDANCE_MANUAL_MANAGE',${ids.admin})`,
				),
			);
			for (const statement of [
				sql`UPDATE account_audit_logs SET action='ACCOUNT_CREATED'`,
				sql`DELETE FROM account_audit_logs`,
				sql`TRUNCATE account_audit_logs`,
			])
				await rejected(db.execute(statement));
			await rejected(
				db.execute(
					sql`INSERT INTO account_audit_logs(actor_user_id,target_user_id,action) VALUES (${ids.admin},${ids.participant},'UNSUPPORTED_ACTION')`,
				),
			);
		});
		test("failed audit insertion rolls back grant state atomically", async () => {
			await db.$client.query(`CREATE FUNCTION p1_fail_permission_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
		CREATE TRIGGER p1_fail_permission_audit BEFORE INSERT ON account_audit_logs FOR EACH ROW WHEN (NEW.action IN ('ACCOUNT_PERMISSION_GRANTED','ACCOUNT_PERMISSION_REVOKED')) EXECUTE FUNCTION p1_fail_permission_audit()`);
			try {
				await rejected(set("rollback", true), "synthetic audit failure");
				expect((await permissions("rollback")).permission.explicit).toBe(false);
			} finally {
				await db.$client.query(
					"DROP TRIGGER p1_fail_permission_audit ON account_audit_logs; DROP FUNCTION p1_fail_permission_audit()",
				);
			}
		});
		function gate() {
			const pid = Promise.withResolvers<number>();
			const ready = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			const source = new Proxy(db, {
				get(object, key, receiver) {
					if (key !== "transaction") return Reflect.get(object, key, receiver);
					return (run: Parameters<Database["transaction"]>[0]) =>
						db.transaction(async (tx) => {
							const backend = await tx.execute<{ pid: number }>(
								sql`select pg_backend_pid() pid`,
							);
							pid.resolve(backend.rows[0]?.pid ?? 0);
							const value = await run(tx);
							ready.resolve();
							await release.promise;
							return value;
						});
				},
			});
			return {
				source,
				pid: pid.promise,
				ready: ready.promise,
				release: () => release.resolve(),
			};
		}
		async function blocked(waiter: number, holder: number) {
			const deadline = Date.now() + 3000;
			while (Date.now() < deadline) {
				const result = await db.$client.query(
					"SELECT $2::int = ANY(pg_blocking_pids($1)) blocked",
					[waiter, holder],
				);
				if (result.rows[0]?.blocked) return;
			}
			throw new Error("Expected bounded PostgreSQL lock wait");
		}
		test("concurrent first grants append one audit; serialized grant then revoke has consistent final state", async () => {
			const results = await Promise.all([set("race", true), set("race", true)]);
			expect(results.filter((row) => row.changed)).toHaveLength(1);
			await set("race", false);
			const a = gate();
			const b = gate();
			b.release();
			const admin = await identity("admin");
			const first = setAccountPermission(a.source, admin, {
				userId: ids.race as string,
				permissionCode: "ATTENDANCE_MANUAL_MANAGE",
				enabled: true,
			});
			await a.ready;
			const second = setAccountPermission(b.source, admin, {
				userId: ids.race as string,
				permissionCode: "ATTENDANCE_MANUAL_MANAGE",
				enabled: false,
			});
			try {
				await blocked(await b.pid, await a.pid);
			} finally {
				a.release();
			}
			await Promise.all([first, second]);
			expect((await permissions("race")).permission.explicit).toBe(false);
			const audits = await db.execute<{ n: number }>(
				sql`SELECT count(*)::int n FROM account_audit_logs WHERE target_user_id=${ids.race}`,
			);
			expect(audits.rows[0]?.n).toBe(4);
		}, 15000);
		test("manual write and revoke respect both transaction orders without stale grant authorization", async () => {
			for (const revokeFirst of [false, true]) {
				await set("member", true);
				const next = await event();
				const admin = await identity("admin");
				const member = await identity("member");
				const a = gate();
				const b = gate();
				b.release();
				const revoke = (source: Database) =>
					setAccountPermission(source, admin, {
						userId: ids.member as string,
						permissionCode: "ATTENDANCE_MANUAL_MANAGE",
						enabled: false,
					});
				const insert = (source: Database) =>
					manualInsert(source, member, manualInput(next));
				const first = revokeFirst ? revoke(a.source) : insert(a.source);
				await a.ready;
				const second = revokeFirst ? insert(b.source) : revoke(b.source);
				const outcome = Promise.allSettled([first, second]);
				try {
					await blocked(await b.pid, await a.pid);
				} finally {
					a.release();
				}
				const results = await outcome;
				expect(results[0]?.status).toBe("fulfilled");
				expect(results[1]?.status).toBe(revokeFirst ? "rejected" : "fulfilled");
				await rejected(
					manualInsert(db, member, manualInput(next)),
					"MANUAL_ACCESS_REQUIRED",
				);
			}
		}, 20000);
	},
);
