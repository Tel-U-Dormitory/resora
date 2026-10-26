import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createAuth } from "@resora/auth";
import { handlePasswordChangeRequest } from "@resora/auth/password-change-request";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { eventParticipants } from "@resora/db/schema/attendance";
import { account, rateLimit, session, user } from "@resora/db/schema/auth";
import {
	accountAuditLogs,
	srPeriodMemberships,
	srPeriods,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { srTenureStatus } from "@resora/db/sr-tenure";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appRouter } from "../../routers";
import { createPeriodSchema } from "./account-period.schema";
import {
	getActiveSrCandidate,
	getActiveSrDirectory,
	getCheckInSr,
} from "./identity.public";

const url = process.env.RESORA_ADMIN_LIFECYCLE_TEST_DB_URL;

// Bun's promise matchers can hang on pg-backed rejections. Await the rejection
// explicitly, preserving every original error-code assertion.
async function expectRejected(
	request: Promise<unknown>,
	expected: { code: string },
) {
	let failure: unknown;
	try {
		await request;
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject(expected);
}
export function guardLifecycleTestUrl(value: string) {
	const parsed = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(parsed.protocol) ||
		parsed.hostname !== "127.0.0.1" ||
		parsed.pathname !== "/resora_identity_test_admin_lifecycle" ||
		parsed.search ||
		parsed.hash
	)
		throw new Error("Fresh loopback lifecycle scratch database required");
	return value;
}
test("lifecycle scratch guard and calendar-date validation", () => {
	for (const value of [
		"postgresql://remote/resora_identity_test_admin_lifecycle",
		"postgresql://127.0.0.1/resora",
		"postgresql://127.0.0.1/resora_identity_test_admin_lifecycle?host=remote",
	])
		expect(() => guardLifecycleTestUrl(value)).toThrow();
	expect(
		createPeriodSchema.safeParse({
			name: "Test",
			startsOn: "2026-02-30",
			endsOn: "2026-12-31",
		}).success,
	).toBe(false);
	expect(
		createPeriodSchema.safeParse({
			name: "Test",
			startsOn: "2026-12-31",
			endsOn: "2026-01-01",
		}).success,
	).toBe(false);
});
(url ? describe : describe.skip)(
	"administrator lifecycle on fresh isolated PostgreSQL",
	() => {
		let db: Database;
		let auth: ReturnType<typeof createAuth>;
		let caller: ReturnType<typeof appRouter.createCaller>;
		let sr: Awaited<ReturnType<typeof caller.identity.createAccount>>;
		let activePeriodId: string;
		let currentPassword: string;
		const adminId = randomUUID();
		const config = {
			BETTER_AUTH_URL: "http://localhost:3000",
			CORS_ORIGIN: "http://localhost:3001",
			BETTER_AUTH_SECRET: "synthetic-lifecycle-auth-secret-000000000000",
			NODE_ENV: "test",
			AUTH_RATE_LIMIT_ENABLED: "false" as const,
		};
		beforeAll(async () => {
			db = createDb({ DATABASE_URL: guardLifecycleTestUrl(url ?? "") });
			const existing = await db.execute(
				sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
			);
			if (existing.rows.length)
				throw new Error(
					"Scratch database must be empty; never reset an existing database",
				);
			await migrate(db, {
				migrationsFolder: resolve(
					import.meta.dir,
					"../../../../db/src/migrations",
				),
			});
			await seedOrganization(db);
			auth = createAuth(config, db);
			await db.transaction(async (tx) => {
				await tx.insert(user).values({
					id: adminId,
					name: "Synthetic lifecycle admin",
					username: "lifecycle.admin",
					email: "admin@example.invalid",
				});
				await tx.insert(userProfiles).values({
					userId: adminId,
					actor: "SYSTEM_ADMIN",
					mustChangePassword: false,
				});
				await tx
					.insert(systemPrivileges)
					.values({ userId: adminId, privilegeCode: "SUPERADMIN" });
			});
			caller = appRouter.createCaller({
				db,
				authConfig: config,
				session: { user: { id: adminId } } as never,
			});
		}, 30000);
		afterAll(async () => {
			await db?.$client.end();
		});
		test("tenure tables enforce RLS and deny inherited Data API privileges", async () => {
			const tables = await db.execute<{
				relname: string;
				relrowsecurity: boolean;
			}>(
				sql`SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.sr_periods'::regclass,'public.sr_period_memberships'::regclass)`,
			);
			expect(tables.rows).toHaveLength(2);
			expect(tables.rows.every((row) => row.relrowsecurity)).toBe(true);
			const privileges = await db.execute<{ allowed: boolean }>(
				sql`SELECT has_table_privilege(r.oid,c.oid,p.privilege) AS allowed FROM pg_roles r CROSS JOIN pg_class c CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) WHERE r.rolname IN ('anon','authenticated') AND c.oid IN ('public.sr_periods'::regclass,'public.sr_period_memberships'::regclass)`,
			);
			expect(privileges.rows.every((row) => !row.allowed)).toBe(true);
		});

		test("period creation, active membership, idempotent renewal and historical membership retention", async () => {
			const current = await caller.identity.createPeriod({
				name: "Current",
				startsOn: "2000-01-01",
				endsOn: "2090-12-31",
			});
			activePeriodId = current.id;
			const old = await caller.identity.createPeriod({
				name: "Old",
				startsOn: "1990-01-01",
				endsOn: "1999-12-31",
			});
			sr = await caller.identity.createAccount({
				name: "Synthetic resident",
				nim: "0000000009",
				email: "resident@example.invalid",
				departmentCode: "HCO",
				positionCode: "ANGGOTA",
				buildingCode: "A",
				periodId: old.id,
			});
			expect(
				await caller.identity.assignPeriod({
					periodId: current.id,
					userIds: [sr.userId, sr.userId],
				}),
			).toEqual({ assigned: 1 });
			expect(
				await caller.identity.assignPeriod({
					periodId: current.id,
					userIds: [sr.userId],
				}),
			).toEqual({ assigned: 0 });
			expect(
				await db
					.select()
					.from(srPeriodMemberships)
					.where(eq(srPeriodMemberships.userId, sr.userId)),
			).toHaveLength(2);
			const snapshot = await caller.identity.accountSnapshot();
			expect(snapshot.accounts[0]?.periods).toHaveLength(2);
			expect(snapshot.accounts[0]?.tenureStatus).toBe("ACTIVE");
		});
		test("extension preserves old dates in audit, rejects shortening and invalid targets atomically", async () => {
			await caller.identity.extendPeriod({
				periodId: activePeriodId,
				endsOn: "2091-12-31",
			});
			// Explicit async catches keep pg-backed failures independent of Bun's promise matchers.
			const shortening = await caller.identity
				.extendPeriod({
					periodId: activePeriodId,
					endsOn: "2080-01-01",
				})
				.catch((error: unknown) => error);
			expect(shortening).toMatchObject({ code: "BAD_REQUEST" });
			const invalidTargets = await caller.identity
				.assignPeriod({
					periodId: activePeriodId,
					userIds: [sr.userId, adminId],
				})
				.catch((error: unknown) => error);
			expect(invalidTargets).toMatchObject({ code: "BAD_REQUEST" });
			const duplicate = await caller.identity
				.createPeriod({
					name: "Current",
					startsOn: "2000-01-01",
					endsOn: "2090-12-31",
				})
				.catch((error: unknown) => error);
			expect(duplicate).toMatchObject({ code: "CONFLICT" });
			const [audit] = await db
				.select()
				.from(accountAuditLogs)
				.where(eq(accountAuditLogs.action, "PERIOD_EXTENDED"));
			expect(audit?.details).toMatchObject({
				before: "2090-12-31",
				after: "2091-12-31",
			});
			// Preserve the immutable-audit rejection assertion with an explicit await.
			let auditMutationError: unknown;
			try {
				await db
					.update(accountAuditLogs)
					.set({ action: "PERIOD_CREATED" })
					.where(eq(accountAuditLogs.action, "PERIOD_EXTENDED"))
					.execute();
			} catch (error) {
				auditMutationError = error;
			}
			expect(auditMutationError).toBeInstanceOf(Error);
		});
		test("tenure date boundaries include the entire final Jakarta day and distinguish all states", async () => {
			const [today] = (
				await db.execute(
					sql`SELECT (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text AS day`,
				)
			).rows as { day: string }[];
			if (!today) throw new Error("Missing synthetic date");
			await db
				.update(srPeriods)
				.set({ startsOn: today.day, endsOn: today.day })
				.where(eq(srPeriods.id, activePeriodId));
			const read = async () =>
				(
					await db
						.select({ status: srTenureStatus(userProfiles.userId) })
						.from(userProfiles)
						.where(eq(userProfiles.userId, sr.userId))
				)[0]?.status;
			expect(await read()).toBe("ACTIVE");
			await db
				.update(srPeriods)
				.set({ startsOn: "2200-01-01", endsOn: "2200-12-31" })
				.where(eq(srPeriods.id, activePeriodId));
			expect(await read()).toBe("EXPIRED"); // Old period ended; a future renewal cannot bridge the gap.
			await db
				.update(srPeriods)
				.set({ startsOn: "2000-01-01", endsOn: "2091-12-31" })
				.where(eq(srPeriods.id, activePeriodId));
		});
		test("real reset revokes sessions, replaces hash and sets the mandatory SR gate", async () => {
			await db.insert(session).values({
				id: randomUUID(),
				userId: sr.userId,
				token: randomUUID(),
				expiresAt: new Date("2090-01-01"),
			});
			const reset = await caller.identity.resetAccountPassword({
				userId: sr.userId,
			});
			currentPassword = reset.temporaryPassword;
			const [credential] = await db
				.select()
				.from(account)
				.where(eq(account.userId, sr.userId));
			expect(credential?.password).not.toBe(reset.temporaryPassword);
			expect(
				await (await auth.$context).password.verify({
					hash: credential?.password ?? "",
					password: reset.temporaryPassword,
				}),
			).toBe(true);
			expect(
				await db.select().from(session).where(eq(session.userId, sr.userId)),
			).toHaveLength(0);
			expect(await getActiveIdentity(db, sr.userId)).toMatchObject({
				passwordResetRequired: true,
			});
			const ordinary = appRouter.createCaller({
				db,
				authConfig: config,
				session: { user: { id: sr.userId } } as never,
			});
			await expectRejected(ordinary.identity.listPeriods(), {
				code: "FORBIDDEN",
			});
			expect(
				JSON.stringify(await db.select().from(accountAuditLogs)),
			).not.toContain(reset.temporaryPassword);
		});
		function request(path: string, body?: unknown, cookie = "") {
			const input = new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					origin: config.CORS_ORIGIN,
					"content-type": "application/json",
					cookie,
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			return path === "change-password"
				? handlePasswordChangeRequest(config, db, input)
				: auth.handler(input);
		}

		test("expiry blocks correct-password login and existing sessions, preserves snapshots, renewal restores only eligible SR", async () => {
			const login = await request("sign-in/username", {
				username: sr.nim,
				password: currentPassword,
			});
			expect(login.status).toBe(200);
			const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
			const newPassword = "SyntheticRotatedPassword42";
			const rotation = await request(
				"change-password",
				{ currentPassword, newPassword },
				cookie,
			);
			expect(rotation.status).toBe(200);
			currentPassword = newPassword;
			const activeLogin = await request("sign-in/username", {
				username: sr.nim,
				password: currentPassword,
			});
			const activeCookie =
				activeLogin.headers.get("set-cookie")?.split(";")[0] ?? "";
			const resident = appRouter.createCaller({
				db,
				authConfig: config,
				session: { user: { id: sr.userId } } as never,
			});
			expect(await resident.identity.profile()).toMatchObject({ nim: sr.nim });
			const event = await caller.attendance.create({
				title: "Synthetic tenure history",
				startsAt: "2026-01-01T00:00:00Z",
				endsAt: "2090-01-01T00:00:00Z",
				rosterCriteria: { allSr: true },
				session: { centerLat: 0, centerLng: 0 },
			});
			await caller.attendance.publish({ eventId: event.eventId });
			const snapshots = await db
				.select()
				.from(eventParticipants)
				.where(eq(eventParticipants.eventId, event.eventId));
			expect(snapshots.some((row) => row.userId === sr.userId)).toBe(true);
			await db
				.update(srPeriods)
				.set({ startsOn: "2000-01-01", endsOn: "2001-12-31" })
				.where(eq(srPeriods.id, activePeriodId));
			const expired = await request("sign-in/username", {
				username: sr.nim,
				password: currentPassword,
			});
			expect(expired.status).toBe(401);
			expect(await expired.json()).toMatchObject({
				code: "SR_TENURE_EXPIRED",
				message: "maaf periode jabatan anda telah purna",
			});
			expect(expired.headers.get("set-cookie")).toBeNull();
			const wrong = await request("sign-in/username", {
				username: sr.nim,
				password: "SyntheticWrongPassword42",
			});
			expect(await wrong.json()).toMatchObject({
				code: "INVALID_USERNAME_OR_PASSWORD",
			});
			expect(
				(await request("get-session", undefined, activeCookie)).status,
			).toBe(401);
			await expectRejected(resident.identity.profile(), {
				code: "UNAUTHORIZED",
			});
			expect(await getActiveIdentity(db, sr.userId)).toBeNull();
			expect(
				(await getActiveSrDirectory(db)).candidates.some(
					(row) => row.userId === sr.userId,
				),
			).toBe(false);
			await db.transaction(async (tx) => {
				expect(await getActiveSrCandidate(tx, sr.userId)).toBeNull();
				expect(await getCheckInSr(tx, sr.userId)).toBeNull();
			});
			expect(
				await db
					.select()
					.from(eventParticipants)
					.where(eq(eventParticipants.eventId, event.eventId)),
			).toEqual(snapshots);
			await db
				.insert(systemPrivileges)
				.values({ userId: sr.userId, privilegeCode: "SUPERADMIN" });
			expect(await getActiveIdentity(db, sr.userId)).toBeNull();
			expect(await getActiveIdentity(db, adminId)).toMatchObject({
				actor: "SYSTEM_ADMIN",
			});
			const renewal = await caller.identity.createPeriod({
				name: "Renewal",
				startsOn: "2000-01-01",
				endsOn: "2099-12-31",
			});
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, sr.userId));
			await caller.identity.assignPeriod({
				periodId: renewal.id,
				userIds: [sr.userId],
			});
			expect(await getActiveIdentity(db, sr.userId)).toBeNull();
			await db
				.update(userProfiles)
				.set({ isActive: true })
				.where(eq(userProfiles.userId, sr.userId));
			expect(await getActiveIdentity(db, sr.userId)).toMatchObject({
				actor: "SR",
			});
			expect(
				(
					await request("sign-in/username", {
						username: sr.nim,
						password: currentPassword,
					})
				).status,
			).toBe(200);
			expect(
				await db
					.select()
					.from(srPeriodMemberships)
					.where(eq(srPeriodMemberships.userId, sr.userId)),
			).toHaveLength(3);
		});
		test("unassigned/future SR cannot login, ordinary SR cannot manage periods and concurrent assignment is idempotent", async () => {
			const unassigned = await caller.identity.createAccount({
				name: "Unassigned",
				nim: "0000000010",
				email: "unassigned@example.invalid",
				departmentCode: "HCO",
				positionCode: "ANGGOTA",
				buildingCode: "A",
			});
			const denied = await request("sign-in/username", {
				username: unassigned.nim,
				password: unassigned.temporaryPassword,
			});
			expect(denied.status).toBe(401);
			expect(await denied.json()).toMatchObject({
				code: "SR_TENURE_NOT_ACTIVE",
			});
			const future = await caller.identity.createPeriod({
				name: "Future",
				startsOn: "2200-01-01",
				endsOn: "2200-12-31",
			});
			const results = await Promise.all([
				caller.identity.assignPeriod({
					periodId: future.id,
					userIds: [unassigned.userId],
				}),
				caller.identity.assignPeriod({
					periodId: future.id,
					userIds: [unassigned.userId],
				}),
			]);
			expect(results.reduce((count, row) => count + row.assigned, 0)).toBe(1);
			expect(await getActiveIdentity(db, unassigned.userId)).toBeNull();
			const scheduled = await request("sign-in/username", {
				username: unassigned.nim,
				password: unassigned.temporaryPassword,
			});
			expect(await scheduled.json()).toMatchObject({
				code: "SR_TENURE_NOT_ACTIVE",
			});
			await caller.identity.assignPeriod({
				periodId:
					(await caller.identity.listPeriods()).find(
						(period) => period.name === "Renewal",
					)?.id ?? "",
				userIds: [unassigned.userId],
			});
			const ordinary = appRouter.createCaller({
				db,
				authConfig: config,
				session: { user: { id: unassigned.userId } } as never,
			});
			await expectRejected(
				ordinary.identity.createPeriod({
					name: "Forbidden",
					startsOn: "2026-01-01",
					endsOn: "2026-12-31",
				}),
				{ code: "FORBIDDEN" },
			);
		});
		test("concurrent administrator reset cannot be overwritten by a stale public password change", async () => {
			for (let attempt = 0; attempt < 3; attempt++) {
				const login = await request("sign-in/username", {
					username: sr.nim,
					password: currentPassword,
				});
				expect(login.status).toBe(200);
				const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
				const [rotation, reset] = await Promise.all([
					request(
						"change-password",
						{
							currentPassword,
							newPassword: `SyntheticConcurrentReplacement${attempt}`,
						},
						cookie,
					),
					caller.identity.resetAccountPassword({ userId: sr.userId }),
				]);
				expect([200, 401]).toContain(rotation.status);
				const [credential] = await db
					.select()
					.from(account)
					.where(eq(account.userId, sr.userId));
				expect(
					await (await auth.$context).password.verify({
						hash: credential?.password ?? "",
						password: reset.temporaryPassword,
					}),
				).toBe(true);
				expect(
					(
						await db
							.select()
							.from(userProfiles)
							.where(eq(userProfiles.userId, sr.userId))
					)[0]?.passwordResetRequired,
				).toBe(true);
				expect(
					await db.select().from(session).where(eq(session.userId, sr.userId)),
				).toHaveLength(0);
				currentPassword = reset.temporaryPassword;
			}
		});
		test("failed native password validation retains production database limiter counters", async () => {
			const login = await request("sign-in/username", {
				username: sr.nim,
				password: currentPassword,
			});
			const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
			for (let attempt = 0; attempt < 2; attempt++) {
				const response = await handlePasswordChangeRequest(
					{
						...config,
						NODE_ENV: "production",
						AUTH_RATE_LIMIT_ENABLED: "true",
					},
					db,
					new Request(`${config.BETTER_AUTH_URL}/api/auth/change-password`, {
						method: "POST",
						headers: {
							origin: config.CORS_ORIGIN,
							"content-type": "application/json",
							cookie,
							"x-resora-client-ip": "192.0.2.120",
						},
						body: JSON.stringify({ currentPassword, newPassword: "short" }),
					}),
				);
				expect(response.status).toBe(400);
			}
			expect(
				(await db.select().from(rateLimit)).some((row) => row.count >= 2),
			).toBe(true);
		});
		test("native session-write failure rolls back password, gate and session deletion", async () => {
			const login = await request("sign-in/username", {
				username: sr.nim,
				password: currentPassword,
			});
			const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
			const before = await db
				.select()
				.from(account)
				.where(eq(account.userId, sr.userId));
			const sessionsBefore = await db
				.select()
				.from(session)
				.where(eq(session.userId, sr.userId));
			await db.execute(
				sql`CREATE FUNCTION public.reject_lifecycle_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic session failure'; END; $$`,
			);
			await db.execute(
				sql`CREATE TRIGGER lifecycle_session_failure BEFORE INSERT ON public.session FOR EACH ROW EXECUTE FUNCTION public.reject_lifecycle_session()`,
			);
			try {
				const response = await request(
					"change-password",
					{ currentPassword, newPassword: "SyntheticRollbackPassword42" },
					cookie,
				);
				expect(response.status).toBeGreaterThanOrEqual(500);
				expect(
					await db.select().from(account).where(eq(account.userId, sr.userId)),
				).toEqual(before);
				expect(
					await db.select().from(session).where(eq(session.userId, sr.userId)),
				).toEqual(sessionsBefore);
				expect(
					(
						await db
							.select()
							.from(userProfiles)
							.where(eq(userProfiles.userId, sr.userId))
					)[0]?.passwordResetRequired,
				).toBe(true);
			} finally {
				await db.execute(
					sql`DROP TRIGGER lifecycle_session_failure ON public.session`,
				);
				await db.execute(sql`DROP FUNCTION public.reject_lifecycle_session()`);
			}
		});
		async function maintenanceResident() {
			const suffix = randomUUID().slice(0, 8);
			const period = await caller.identity.createPeriod({
				name: `Maintenance ${suffix}`,
				startsOn: "1990-01-01",
				endsOn: "2999-12-31",
			});
			return caller.identity.createAccount({
				name: "Synthetic maintenance",
				nim: `maint.${suffix}`,
				email: `maint.${suffix}@example.invalid`,
				departmentCode: "HCO",
				positionCode: "ANGGOTA",
				buildingCode: "A",
				periodId: period.id,
			});
		}
		async function maintenanceInput(userId: string) {
			const row = (await caller.identity.accountSnapshot()).accounts.find(
				(a) => a.userId === userId,
			);
			if (!row) throw new Error("Missing synthetic account");
			return {
				userId,
				name: row.name,
				email: row.email,
				departmentCode: row.departmentCode,
				positionCode: row.positionCode,
				buildingCode: row.buildingCode ?? "A",
				isActive: row.isActive,
				expectedUpdatedAt: row.updatedAt.toISOString(),
			};
		}
		async function maintenanceSnapshot(userId: string) {
			const event = await caller.attendance.create({
				title: "Synthetic maintenance history",
				startsAt: "2026-01-01T00:00:00Z",
				endsAt: "2090-01-01T00:00:00Z",
				rosterCriteria: { allSr: true },
				session: { centerLat: 0, centerLng: 0 },
			});
			await caller.attendance.publish({ eventId: event.eventId });
			const rows = await db
				.select()
				.from(eventParticipants)
				.where(eq(eventParticipants.eventId, event.eventId));
			expect(rows.some((row) => row.userId === userId)).toBe(true);
			return { eventId: event.eventId, rows };
		}
		test("edit preserves login identity and membership, revokes sessions and records before/after", async () => {
			const resident = await maintenanceResident();
			const historical = await maintenanceSnapshot(resident.userId);
			const login = await request("sign-in/username", {
				username: resident.nim,
				password: resident.temporaryPassword,
			});
			expect(login.status).toBe(200);
			const beforeMemberships = await db
				.select()
				.from(srPeriodMemberships)
				.where(eq(srPeriodMemberships.userId, resident.userId));
			const input = await maintenanceInput(resident.userId);
			await caller.identity.updateAccount({
				...input,
				name: "Updated synthetic resident",
				email: "updated.maintenance@example.invalid",
				buildingCode: "B",
			});
			expect(
				await db
					.select()
					.from(eventParticipants)
					.where(eq(eventParticipants.eventId, historical.eventId)),
			).toEqual(historical.rows);
			const [after] = await db
				.select()
				.from(user)
				.where(eq(user.id, resident.userId));
			expect(after?.name).toBe("Updated synthetic resident");
			expect(after?.username).toBe(resident.nim);
			expect(after?.emailVerified).toBe(false);
			expect(
				await db
					.select()
					.from(session)
					.where(eq(session.userId, resident.userId)),
			).toHaveLength(0);
			expect(
				await db
					.select()
					.from(srPeriodMemberships)
					.where(eq(srPeriodMemberships.userId, resident.userId)),
			).toEqual(beforeMemberships);
			const logs = await db
				.select()
				.from(accountAuditLogs)
				.where(eq(accountAuditLogs.targetUserId, resident.userId));
			expect(
				logs.find((log) => log.action === "ACCOUNT_UPDATED")?.details,
			).toMatchObject({
				before: { name: input.name, email: input.email },
				after: { name: "Updated synthetic resident", buildingCode: "B" },
			});
			await expectRejected(
				caller.identity.updateAccount({ ...input, name: "Stale overwrite" }),
				{ code: "CONFLICT" },
			);
		});
		test("invalid organization, duplicate email and non-admin edits are denied without changing account", async () => {
			const resident = await maintenanceResident();
			const input = await maintenanceInput(resident.userId);
			const before = await db
				.select()
				.from(user)
				.where(eq(user.id, resident.userId));
			const logCount = (
				await db
					.select()
					.from(accountAuditLogs)
					.where(eq(accountAuditLogs.targetUserId, resident.userId))
			).length;
			await expectRejected(
				caller.identity.updateAccount({ ...input, positionCode: "UNKNOWN" }),
				{ code: "BAD_REQUEST" },
			);
			await expectRejected(
				caller.identity.updateAccount({
					...input,
					email: "admin@example.invalid",
				}),
				{ code: "CONFLICT" },
			);
			expect(
				await db.select().from(user).where(eq(user.id, resident.userId)),
			).toEqual(before);
			expect(
				await db
					.select()
					.from(accountAuditLogs)
					.where(eq(accountAuditLogs.targetUserId, resident.userId)),
			).toHaveLength(logCount);
			await db
				.update(userProfiles)
				.set({ mustChangePassword: false, passwordResetRequired: false })
				.where(eq(userProfiles.userId, resident.userId));
			const ordinary = appRouter.createCaller({
				db,
				authConfig: config,
				session: { user: { id: resident.userId } } as never,
			});
			await expectRejected(ordinary.identity.updateAccount(input), {
				code: "FORBIDDEN",
			});
			await expectRejected(
				ordinary.identity.archiveAccount({
					userId: resident.userId,
					expectedUpdatedAt: input.expectedUpdatedAt,
				}),
				{ code: "FORBIDDEN" },
			);
			await expectRejected(
				caller.identity.archiveAccount({
					userId: adminId,
					expectedUpdatedAt: input.expectedUpdatedAt,
				}),
				{ code: "NOT_FOUND" },
			);
		});
		test("archive disables native login and revokes sessions while preserving identity, audit and membership; edit restores access", async () => {
			const resident = await maintenanceResident();
			const historical = await maintenanceSnapshot(resident.userId);
			expect(
				(
					await request("sign-in/username", {
						username: resident.nim,
						password: resident.temporaryPassword,
					})
				).status,
			).toBe(200);
			const input = await maintenanceInput(resident.userId);
			const credentials = await db
				.select()
				.from(account)
				.where(eq(account.userId, resident.userId));
			const memberships = await db
				.select()
				.from(srPeriodMemberships)
				.where(eq(srPeriodMemberships.userId, resident.userId));
			const audit = await db
				.select()
				.from(accountAuditLogs)
				.where(eq(accountAuditLogs.targetUserId, resident.userId));
			await caller.identity.archiveAccount({
				userId: resident.userId,
				expectedUpdatedAt: input.expectedUpdatedAt,
			});
			expect(
				await db
					.select()
					.from(eventParticipants)
					.where(eq(eventParticipants.eventId, historical.eventId)),
			).toEqual(historical.rows);
			expect(await getActiveIdentity(db, resident.userId)).toBeNull();
			expect(
				(
					await request("sign-in/username", {
						username: resident.nim,
						password: resident.temporaryPassword,
					})
				).status,
			).not.toBe(200);
			expect(
				await db
					.select()
					.from(session)
					.where(eq(session.userId, resident.userId)),
			).toHaveLength(0);
			expect(
				await db
					.select()
					.from(account)
					.where(eq(account.userId, resident.userId)),
			).toEqual(credentials);
			expect(
				await db
					.select()
					.from(srPeriodMemberships)
					.where(eq(srPeriodMemberships.userId, resident.userId)),
			).toEqual(memberships);
			const afterAudit = await db
				.select()
				.from(accountAuditLogs)
				.where(eq(accountAuditLogs.targetUserId, resident.userId));
			expect(afterAudit).toEqual(expect.arrayContaining(audit));
			expect(afterAudit.some((log) => log.action === "ACCOUNT_ARCHIVED")).toBe(
				true,
			);
			await caller.identity.updateAccount({
				...(await maintenanceInput(resident.userId)),
				isActive: true,
			});
			expect(
				(
					await request("sign-in/username", {
						username: resident.nim,
						password: resident.temporaryPassword,
					})
				).status,
			).toBe(200);
		});
		test("concurrent account writes accept only one matching version", async () => {
			const resident = await maintenanceResident();
			const input = await maintenanceInput(resident.userId);
			const results = await Promise.allSettled([
				caller.identity.updateAccount({ ...input, name: "First update" }),
				caller.identity.archiveAccount({
					userId: resident.userId,
					expectedUpdatedAt: input.expectedUpdatedAt,
				}),
			]);
			expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
			expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
		});
		test("audit failure rolls back edit/archive and target session revocation", async () => {
			const resident = await maintenanceResident();
			expect(
				(
					await request("sign-in/username", {
						username: resident.nim,
						password: resident.temporaryPassword,
					})
				).status,
			).toBe(200);
			const input = await maintenanceInput(resident.userId);
			const beforeUser = await db
				.select()
				.from(user)
				.where(eq(user.id, resident.userId));
			const beforeProfile = await db
				.select()
				.from(userProfiles)
				.where(eq(userProfiles.userId, resident.userId));
			const beforeSessions = await db
				.select()
				.from(session)
				.where(eq(session.userId, resident.userId));
			await db.execute(
				sql`CREATE FUNCTION public.reject_maintenance_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('ACCOUNT_UPDATED','ACCOUNT_ARCHIVED') THEN RAISE EXCEPTION 'Synthetic maintenance audit failure'; END IF; RETURN NEW; END; $$`,
			);
			await db.execute(
				sql`CREATE TRIGGER maintenance_audit_failure BEFORE INSERT ON public.account_audit_logs FOR EACH ROW EXECUTE FUNCTION public.reject_maintenance_audit()`,
			);
			try {
				await expectRejected(
					caller.identity.updateAccount({ ...input, name: "Should roll back" }),
					{ code: "INTERNAL_SERVER_ERROR" },
				);
				await expectRejected(
					caller.identity.archiveAccount({
						userId: resident.userId,
						expectedUpdatedAt: input.expectedUpdatedAt,
					}),
					{ code: "INTERNAL_SERVER_ERROR" },
				);
				expect(
					await db.select().from(user).where(eq(user.id, resident.userId)),
				).toEqual(beforeUser);
				expect(
					await db
						.select()
						.from(userProfiles)
						.where(eq(userProfiles.userId, resident.userId)),
				).toEqual(beforeProfile);
				expect(
					await db
						.select()
						.from(session)
						.where(eq(session.userId, resident.userId)),
				).toEqual(beforeSessions);
			} finally {
				await db.execute(
					sql`DROP TRIGGER maintenance_audit_failure ON public.account_audit_logs`,
				);
				await db.execute(sql`DROP FUNCTION public.reject_maintenance_audit()`);
			}
		});
	},
);
