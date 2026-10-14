import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createAuth } from "@resora/auth";
import { getActiveSr } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { account, user } from "@resora/db/schema/auth";
import {
	buildings,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../../../../apps/server/src/app";
import {
	canManageInternalAttendanceManually,
	canManageInternalEvent,
	canOperateGeneralActivity,
	hasSuperadminPrivilege,
} from "./identity-policy";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "./sr-provisioning";

const target = process.env.RESORA_IDENTITY_TEST_DB_URL;
(target ? describe : describe.skip)(
	"live identity RBAC on guarded local PostgreSQL",
	() => {
		let db: Database;
		let server: Server;
		let auth: ReturnType<typeof createAuth>;
		let base: string;
		const prefix = `synthetic-rbac-${randomUUID()}`;
		const ids = ["hco", "kadep", "adaptif", "rnd", "initial", "inactive"].map(
			(key) => `${prefix}-${key}`,
		);
		const nims = ids.map(
			(_, index) => `000${randomBytes(8).toString("hex")}${index}`,
		);
		const password = randomBytes(24).toString("hex");
		const origin = "http://localhost:3001";
		let ip = 1;
		const id = (index: number) => {
			const value = ids[index];
			if (!value) throw new Error("Missing synthetic identity");
			return value;
		};
		const login = async (index: number) => {
			const response = await auth.handler(
				new Request("http://127.0.0.1:3000/api/auth/sign-in/username", {
					method: "POST",
					headers: {
						origin,
						"content-type": "application/json",
						"x-resora-client-ip": `192.0.2.${ip++}`,
					},
					body: JSON.stringify({ username: nims[index], password }),
				}),
			);
			expect(response.status).toBe(200);
			return response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
		};
		const rpc = (cookie?: string, input?: object) =>
			fetch(
				`${base}/trpc/privateData${input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ""}`,
				{ headers: cookie ? { cookie } : {} },
			);
		beforeAll(async () => {
			const url = localProvisioningTarget(target);
			db = createDb({ DATABASE_URL: url });
			await verifyLocalProvisioningDatabase(db, url);
			await seedOrganization(db);
			auth = createAuth(
				{
					BETTER_AUTH_URL: "http://127.0.0.1:3000",
					BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
					CORS_ORIGIN: origin,
				},
				db,
			);
			const hash = await (await auth.$context).password.hash(password);
			const building = (
				await db.select().from(buildings).where(eq(buildings.code, "A"))
			)[0];
			if (!building) throw new Error("Missing official building");
			await db.transaction(async (tx) => {
				for (const [index, userId] of ids.entries()) {
					await tx.insert(user).values({
						id: userId,
						name: "Synthetic RBAC SR",
						email: `${userId}@example.invalid`,
						username: nims[index],
					});
					await tx.insert(account).values({
						id: userId,
						userId,
						accountId: userId,
						providerId: "credential",
						password: hash,
						updatedAt: new Date(),
					});
					await tx.insert(userProfiles).values({
						userId,
						actor: "SR",
						isActive: index !== 5,
						mustChangePassword: index === 4,
					});
					await tx.insert(srProfiles).values({
						userId,
						departmentCode:
							index === 2 ? "ADAPTIF" : index === 3 ? "RND" : "HCO",
						positionCode: index === 1 ? "KADEP" : "ANGGOTA",
						buildingId: building.id,
					});
				}
			});
			server = createApp({ db, auth }, origin).listen(0, "127.0.0.1");
			await new Promise<void>((done) => server.once("listening", done));
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Local listener unavailable");
			base = `http://127.0.0.1:${address.port}`;
		}, 20_000);
		afterAll(async () => {
			if (server) {
				server.closeAllConnections();
				await new Promise<void>((done) => server.close(() => done()));
			}
			if (db) {
				await db.transaction(async (tx) => {
					await tx
						.delete(systemPrivileges)
						.where(inArray(systemPrivileges.userId, ids));
					await tx.delete(srProfiles).where(inArray(srProfiles.userId, ids));
					await tx.delete(user).where(inArray(user.id, ids));
				});
				await db.$client.end();
			}
		});
		test("database organization and explicit privilege determine policy", async () => {
			expect(canManageInternalEvent(await getActiveSr(db, id(0)))).toBe(true);
			expect(
				canManageInternalAttendanceManually(await getActiveSr(db, id(0))),
			).toBe(false);
			expect(
				canManageInternalAttendanceManually(await getActiveSr(db, id(1))),
			).toBe(true);
			expect(canOperateGeneralActivity(await getActiveSr(db, id(2)))).toBe(
				true,
			);
			expect(hasSuperadminPrivilege(await getActiveSr(db, id(3)))).toBe(false);
			await db
				.insert(systemPrivileges)
				.values({ userId: id(3), privilegeCode: "SUPERADMIN" });
			const granted = await getActiveSr(db, id(3));
			expect(hasSuperadminPrivilege(granted)).toBe(true);
			expect(canManageInternalAttendanceManually(granted)).toBe(true);
			expect(canManageInternalEvent(granted)).toBe(true);
			expect(canOperateGeneralActivity(granted)).toBe(true);
			await db
				.delete(systemPrivileges)
				.where(eq(systemPrivileges.userId, id(3)));
			const revoked = await getActiveSr(db, id(3));
			expect(hasSuperadminPrivilege(revoked)).toBe(false);
			expect(canManageInternalEvent(revoked)).toBe(false);
			expect(canManageInternalAttendanceManually(revoked)).toBe(false);
		});
		test("assignment changes are read from DB rather than cached role claims", async () => {
			await db
				.update(srProfiles)
				.set({ departmentCode: "SOSIAL" })
				.where(eq(srProfiles.userId, id(1)));
			expect(
				canManageInternalAttendanceManually(await getActiveSr(db, id(1))),
			).toBe(false);
			await db
				.update(srProfiles)
				.set({ departmentCode: "HCO" })
				.where(eq(srProfiles.userId, id(1)));
			expect(
				canManageInternalAttendanceManually(await getActiveSr(db, id(1))),
			).toBe(true);
		});
		test("anonymous/invalid sessions fail; regular SR initial credentials permit protected API", async () => {
			expect((await rpc()).status).toBe(401);
			expect((await rpc("better-auth.session_token=invalid")).status).toBe(401);
			expect((await rpc(await login(4))).status).toBe(200);
		});
		test("deactivation blocks an existing session and all policies", async () => {
			const cookie = await login(0);
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, id(0)));
			try {
				expect((await rpc(cookie)).status).toBe(401);
				expect(canManageInternalEvent(await getActiveSr(db, id(0)))).toBe(
					false,
				);
			} finally {
				await db
					.update(userProfiles)
					.set({ isActive: true })
					.where(eq(userProfiles.userId, id(0)));
			}
			expect(await getActiveSr(db, id(5))).toBeNull();
		});
		test("forged client department/position/privilege never replace database identity", async () => {
			const cookie = await login(3);
			const response = await rpc(cookie, {
				departmentCode: "HCO",
				positionCode: "KADEP",
				isSuperadmin: true,
			});
			expect(response.status).toBe(200);
			const current = await getActiveSr(db, id(3));
			expect(current?.departmentCode).toBe("RND");
			expect(current?.positionCode).toBe("ANGGOTA");
			expect(canManageInternalAttendanceManually(current)).toBe(false);
			expect(hasSuperadminPrivilege(current)).toBe(false);
		});
	},
);
