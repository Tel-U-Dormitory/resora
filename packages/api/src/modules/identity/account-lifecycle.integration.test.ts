import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createAuth } from "@resora/auth";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { account, session, user } from "@resora/db/schema/auth";
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

const url = process.env.RESORA_ADMIN_LIFECYCLE_TEST_DB_URL;
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
			await expect(
				caller.identity.extendPeriod({
					periodId: activePeriodId,
					endsOn: "2080-01-01",
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				caller.identity.assignPeriod({
					periodId: activePeriodId,
					userIds: [sr.userId, adminId],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				caller.identity.createPeriod({
					name: "Current",
					startsOn: "2000-01-01",
					endsOn: "2090-12-31",
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
			const [audit] = await db
				.select()
				.from(accountAuditLogs)
				.where(eq(accountAuditLogs.action, "PERIOD_EXTENDED"));
			expect(audit?.details).toMatchObject({
				before: "2090-12-31",
				after: "2091-12-31",
			});
			await expect(
				db
					.update(accountAuditLogs)
					.set({ action: "PERIOD_CREATED" })
					.where(eq(accountAuditLogs.action, "PERIOD_EXTENDED"))
					.execute(),
			).rejects.toThrow();
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
			await expect(ordinary.identity.listPeriods()).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(
				JSON.stringify(await db.select().from(accountAuditLogs)),
			).not.toContain(reset.temporaryPassword);
		});
	},
);
