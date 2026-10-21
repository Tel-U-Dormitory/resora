import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { type Auth, createAuth } from "@resora/auth";
import { createDb, type Database } from "@resora/db";
import { account, user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srPeriodMemberships,
	srProfiles,
	userProfiles,
} from "@resora/db/schema/identity";
import { assignSyntheticSrTenure } from "@resora/db/sr-tenure.fixture";
import { eq, inArray } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";

import { createApp } from "../../../apps/server/src/app";

// No Varlock, DATABASE_URL, DIRECT_DB_URL or remote fallback in this test suite.
const testUrl = process.env.RESORA_IDENTITY_TEST_DB_URL;
function guard(value: string) {
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
		!/^\/resora_identity_test_[a-z0-9_]+$/.test(url.pathname) ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"Auth tests require a loopback resora_identity_test_* database without URL options",
		);
	}
	return value;
}
test("auth integration guard rejects remote and ordinary application targets", () => {
	for (const url of [
		"postgresql://remote.invalid/resora_identity_test_auth",
		"postgresql://localhost/resora",
		"postgresql://localhost/resora_identity_test_auth?host=remote.invalid",
	])
		expect(() => guard(url)).toThrow();
});

(testUrl ? describe : describe.skip)(
	"SR authentication on disposable local PostgreSQL",
	() => {
		let db: Database;
		let auth: Auth;
		let server: Server;
		let base: string;
		let addressCounter = 1;
		let fixturesCreated = false;
		const prefix = `synthetic-auth-${randomUUID()}`;
		const dict = `SYN_AUTH_${randomBytes(5).toString("hex")}`;
		const buildingId = randomUUID();
		const password = randomBytes(24).toString("hex");
		const newPassword = randomBytes(24).toString("hex");
		const activeId = `${prefix}-active`;
		const ids = [
			"active",
			"inactive",
			"student",
			"initial",
			"unprovisioned",
		].map((key) => `${prefix}-${key}`);
		const nims = ids.map(
			(_, index) => `000${randomInt(10000000, 99999999)}${index}`,
		);
		const origin = "http://localhost:3001";
		const cookie = (response: Response) =>
			response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
		const native = (path: string, body?: object, sessionCookie?: string) =>
			auth.handler(
				new Request(`http://127.0.0.1:3000/api/auth/${path}`, {
					method: body ? "POST" : "GET",
					headers: {
						origin,
						"content-type": "application/json",
						"x-resora-client-ip": `192.0.2.${addressCounter++}`,
						...(sessionCookie ? { cookie: sessionCookie } : {}),
					},
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			);
		const login = async (index: number) => {
			const response = await native("sign-in/username", {
				username: nims[index],
				password,
			});
			expect(response.status).toBe(200);
			const sessionCookie = cookie(response);
			expect(Boolean(sessionCookie)).toBe(true);
			return sessionCookie;
		};
		const rpc = async (sessionCookie?: string, path = "privateData") => {
			const response = await fetch(`${base}/trpc/${path}`, {
				headers: sessionCookie ? { cookie: sessionCookie } : {},
			});
			return {
				status: response.status,
				body: (await response.json()) as {
					result: {
						data: {
							mustChangePassword?: boolean;
							user?: { nim: string };
						} | null;
					};
				},
			};
		};
		beforeAll(async () => {
			if (!testUrl) throw new Error("Local auth test target not configured");
			db = createDb({ DATABASE_URL: guard(testUrl) });
			const target = (
				await db.$client.query(
					"SELECT current_database() AS name, host(inet_server_addr()) AS host",
				)
			).rows[0];
			expect(target.name.startsWith("resora_identity_test_")).toBe(true);
			expect(["127.0.0.1", "::1"].includes(target.host)).toBe(true);
			expect(
				Number(
					(
						await db.$client.query(
							"SELECT count(*) FROM drizzle.__drizzle_migrations",
						)
					).rows[0].count,
				),
			).toBe(
				readMigrationFiles({
					migrationsFolder: resolve(import.meta.dir, "../../db/src/migrations"),
				}).length,
			);
			auth = createAuth(
				{
					BETTER_AUTH_URL: "http://127.0.0.1:3000",
					BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
					CORS_ORIGIN: origin,
				},
				db,
			);
			const hash = await (await auth.$context).password.hash(password);
			await db.transaction(async (tx) => {
				await tx
					.insert(departments)
					.values({ code: dict, name: "Synthetic department" });
				await tx
					.insert(positions)
					.values({ code: dict, name: "Synthetic position" });
				await tx
					.insert(buildings)
					.values({ id: buildingId, code: dict, name: "Synthetic building" });
				for (const [index, id] of ids.entries()) {
					await tx.insert(user).values({
						id,
						name: "Synthetic SR",
						email: `${id}@example.invalid`,
						username: nims[index],
					});
					await tx.insert(account).values({
						id,
						userId: id,
						accountId: id,
						providerId: "credential",
						password: hash,
						updatedAt: new Date(),
					});
					if (index === 4) continue;
					await tx.insert(userProfiles).values({
						userId: id,
						actor: index === 2 ? "MAHASISWA" : "SR",
						isActive: index !== 1,
						mustChangePassword: index === 3,
					});
					if (index !== 2)
						await tx.insert(srProfiles).values({
							userId: id,
							departmentCode: dict,
							positionCode: dict,
							buildingId,
						});
				}
			});
			await assignSyntheticSrTenure(db, ids);
			fixturesCreated = true;
			server = createApp(
				{
					db,
					auth,
					authConfig: {
						BETTER_AUTH_URL: "http://127.0.0.1:3000",
						CORS_ORIGIN: origin,
						BETTER_AUTH_SECRET: auth.options.secret as string,
					},
				},
				origin,
			).listen(0, "127.0.0.1");
			await new Promise<void>((resolve) => server.once("listening", resolve));
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Local test listener unavailable");
			base = `http://127.0.0.1:${address.port}`;
		}, 20_000);
		afterAll(async () => {
			if (server) {
				server.closeAllConnections();
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
			if (fixturesCreated)
				await db.transaction(async (tx) => {
					await tx
						.delete(srPeriodMemberships)
						.where(inArray(srPeriodMemberships.userId, ids));
					await tx.delete(srProfiles).where(inArray(srProfiles.userId, ids));
					await tx.delete(user).where(inArray(user.id, ids));
					await tx.delete(buildings).where(eq(buildings.id, buildingId));
					await tx.delete(positions).where(eq(positions.code, dict));
					await tx.delete(departments).where(eq(departments.code, dict));
				});
			await db?.$client.end();
		}, 20_000);

		test("active SR logs in through Express and keeps leading-zero NIM", async () => {
			const response = await fetch(`${base}/api/auth/sign-in/username`, {
				method: "POST",
				headers: { origin, "content-type": "application/json" },
				body: JSON.stringify({ username: nims[0], password }),
			});
			expect(response.status).toBe(200);
			expect(
				((await response.json()) as { user: { username: string } }).user
					.username,
			).toBe(nims[0] ?? "");
			const sessionCookie = cookie(response);
			const protectedData = await rpc(sessionCookie);
			expect(protectedData.status).toBe(200);
			expect(protectedData.body.result.data?.user?.nim).toBe(nims[0]);
			const status = await rpc(sessionCookie, "identity.session");
			expect(status.body.result.data?.mustChangePassword).toBe(false);
			expect(Object.keys(status.body.result.data ?? {}).sort()).toEqual([
				"actor",
				"canManageInternalAttendanceManually",
				"canManageInternalEvents",
				"canOperateGeneralActivity",
				"isSuperadmin",
				"mustChangePassword",
				"name",
				"nim",
				"requiresPasswordChange",
				"userId",
			]);
		});
		test("wrong password and unknown NIM return the same safe denial", async () => {
			const wrongPassword = randomBytes(24).toString("hex");
			const wrong = await native("sign-in/username", {
				username: nims[0],
				password: wrongPassword,
			});
			const unknown = await native("sign-in/username", {
				username: "000000000000000000",
				password: wrongPassword,
			});
			expect(wrong.status).toBe(401);
			expect(unknown.status).toBe(401);
			const first = await wrong.text();
			const second = await unknown.text();
			expect(first === second).toBe(true);
			expect(first.includes(wrongPassword) || first.includes(password)).toBe(
				false,
			);
		});
		test("inactive, non-SR and unprovisioned credentials cannot create a session", async () => {
			for (const index of [1, 2, 4]) {
				const response = await native("sign-in/username", {
					username: nims[index],
					password,
				});
				expect(response.status).toBe(401);
				expect(((await response.json()) as { code: string }).code).toBe(
					"INVALID_USERNAME_OR_PASSWORD",
				);
			}
			const rows = await db.$client.query(
				"SELECT count(*) FROM public.session WHERE user_id = ANY($1::text[])",
				[[ids[1], ids[2], ids[4]]],
			);
			expect(Number(rows.rows[0].count)).toBe(0);
		});
		test("NIM stays a string; numeric input is rejected", async () => {
			const response = await native("sign-in/username", {
				username: 123456,
				password,
			});
			expect(response.ok).toBe(false);
			expect((await response.text()).includes(password)).toBe(false);
		});
		test("public signup and email bypass fail via direct Express HTTP requests", async () => {
			for (const path of ["sign-up/email", "sign-in/email", "update-user"]) {
				const response = await fetch(`${base}/api/auth/${path}`, {
					method: "POST",
					headers: { origin, "content-type": "application/json" },
					body: JSON.stringify({
						name: "Synthetic",
						email: `${prefix}@example.invalid`,
						password,
					}),
				});
				expect(response.status).toBe(403);
				expect((await response.text()).includes(password)).toBe(false);
			}
		});
		test("anonymous API access is denied and session status contains no credentials", async () => {
			expect((await rpc()).status).toBe(401);
			expect(
				(await rpc(undefined, "identity.session")).body.result.data,
			).toBeNull();
		});
		test("existing SR sessions lose access immediately after account deactivation", async () => {
			const sessionCookie = await login(0);
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, activeId));
			try {
				expect((await rpc(sessionCookie)).status).toBe(401);
				expect(
					(await native("get-session", undefined, sessionCookie)).status,
				).toBe(401);
			} finally {
				await db
					.update(userProfiles)
					.set({ isActive: true })
					.where(eq(userProfiles.userId, activeId));
			}
		});
		test("logout deletes the persisted session and replaying its cookie is denied", async () => {
			const sessionCookie = await login(0);
			const response = await fetch(`${base}/api/auth/sign-out`, {
				method: "POST",
				headers: {
					origin,
					cookie: sessionCookie,
					"content-type": "application/json",
				},
				body: "{}",
			});
			expect(response.status).toBe(200);
			expect((await rpc(sessionCookie)).status).toBe(401);
		});
		test("an old session cannot retain SR access after actor reassignment", async () => {
			const sessionCookie = await login(0);
			await db.transaction(async (tx) => {
				await tx
					.delete(srPeriodMemberships)
					.where(eq(srPeriodMemberships.userId, activeId));
				await tx.delete(srProfiles).where(eq(srProfiles.userId, activeId));
				await tx
					.update(userProfiles)
					.set({ actor: "MAHASISWA" })
					.where(eq(userProfiles.userId, activeId));
			});
			try {
				expect((await rpc(sessionCookie)).status).toBe(401);
			} finally {
				await db.transaction(async (tx) => {
					await tx
						.update(userProfiles)
						.set({ actor: "SR" })
						.where(eq(userProfiles.userId, activeId));
					await tx.insert(srProfiles).values({
						userId: activeId,
						departmentCode: dict,
						positionCode: dict,
						buildingId,
					});
				});
				await assignSyntheticSrTenure(db, [activeId]);
			}
		});
		test("expired persisted session cannot authorize protected requests", async () => {
			const sessionCookie = await login(0);
			await db.$client.query(
				"UPDATE public.session SET expires_at = now() - interval '1 minute' WHERE user_id=$1",
				[ids[0]],
			);
			expect((await rpc(sessionCookie)).status).toBe(401);
		});
		test("regular SR initial credentials permit APIs and voluntary rotation revokes old sessions", async () => {
			const originalCookie = await login(3);
			const otherCookie = await login(3);
			expect((await rpc(originalCookie)).status).toBe(200);
			expect(
				(await rpc(originalCookie, "identity.session")).body.result.data
					?.mustChangePassword,
			).toBe(true);
			const invalid = await native(
				"change-password",
				{ currentPassword: randomBytes(24).toString("hex"), newPassword },
				originalCookie,
			);
			expect(invalid.ok).toBe(false);
			const unchanged = await native(
				"change-password",
				{ currentPassword: password, newPassword: password },
				originalCookie,
			);
			expect(unchanged.status).toBe(400);
			expect((await rpc(originalCookie)).status).toBe(200);
			const response = await native(
				"change-password",
				{ currentPassword: password, newPassword, revokeOtherSessions: false },
				originalCookie,
			);
			expect(response.status).toBe(200);
			const rotatedCookie = cookie(response);
			expect(Boolean(rotatedCookie)).toBe(true);
			expect((await rpc(rotatedCookie)).status).toBe(200);
			expect(
				(await rpc(rotatedCookie, "identity.session")).body.result.data
					?.mustChangePassword,
			).toBe(false);
			expect((await rpc(originalCookie)).status).toBe(401);
			expect((await rpc(otherCookie)).status).toBe(401);
			const oldLogin = await native("sign-in/username", {
				username: nims[3],
				password,
			});
			expect(oldLogin.status).toBe(401);
			expect(
				(
					await native("sign-in/username", {
						username: nims[3],
						password: newPassword,
					})
				).status,
			).toBe(200);
		});
		test("untrusted and missing origins are rejected before credential work", async () => {
			const response = await auth.handler(
				new Request("http://127.0.0.1:3000/api/auth/sign-in/username", {
					method: "POST",
					headers: {
						origin: "https://untrusted.example.invalid",
						"content-type": "application/json",
					},
					body: JSON.stringify({ username: nims[0], password }),
				}),
			);
			expect(response.status).toBe(403);
			const missing = await fetch(`${base}/api/auth/sign-in/username`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ username: nims[0], password }),
			});
			expect(missing.status).toBe(403);
		});
		test("login throttling rejects repeated attempts despite spoofed IP headers", async () => {
			let status = 0;
			for (let index = 0; index < 76; index++) {
				const response = await fetch(`${base}/api/auth/sign-in/username`, {
					method: "POST",
					headers: {
						origin,
						"content-type": "application/json",
						"x-forwarded-for": `198.51.100.${index + 1}`,
						"x-resora-client-ip": `192.0.2.${index + 1}`,
					},
					body: JSON.stringify({
						// Exercise the limiter without 75 unnecessary password hashes.
						username: 123,
						password: "synthetic-invalid-body",
					}),
				});
				status = response.status;
				if (status === 429)
					expect(Boolean(response.headers.get("x-retry-after"))).toBe(true);
			}
			expect(status).toBe(429);
		});
	},
);
