import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { Database } from "@resora/db";
import { createAuth } from "./index";

for (const rateLimitEnabled of [undefined, "true", "false"] as const) {
	test(`get-session (${rateLimitEnabled ?? "default"} limiter) reads storage once and revalidates live identity on every request`, async () => {
		const secret = "synthetic-session-read-test-secret-00000000";
		let reads = 0;
		let identities = 0;
		const profile = {
			userId: "synthetic-sr",
			actor: "SR",
			tenureStatus: "ACTIVE",
			isActive: true,
			mustChangePassword: false,
			nim: "0000000001",
			departmentCode: "HCO" as string | null,
			positionCode: "ANGGOTA" as string | null,
			buildingId: "synthetic-building" as string | null,
			srUserId: "synthetic-sr" as string | null,
			isSuperadmin: false,
		};
		const query = {
			innerJoin: () => query,
			leftJoin: () => query,
			where: async () => {
				identities++;
				return [profile];
			},
		};
		const db = { select: () => ({ from: () => query }) } as unknown as Database;
		const auth = createAuth(
			{
				BETTER_AUTH_URL: "http://localhost:3000",
				CORS_ORIGIN: "http://localhost:3001",
				BETTER_AUTH_SECRET: secret,
				NODE_ENV: "test",
				AUTH_RATE_LIMIT_ENABLED: rateLimitEnabled,
			},
			db,
		);
		const context = await auth.$context;
		const now = new Date();
		const session = {
			id: "synthetic-session",
			token: "synthetic-token",
			userId: profile.userId,
			createdAt: now,
			updatedAt: now,
			expiresAt: new Date(
				now.getTime() + context.sessionConfig.expiresIn * 1000,
			),
			ipAddress: null,
			userAgent: null,
		};
		context.internalAdapter.findSession = async () => {
			reads++;
			return {
				session,
				user: {
					id: profile.userId,
					name: "Synthetic SR",
					email: "synthetic@example.invalid",
					emailVerified: true,
					createdAt: now,
					updatedAt: now,
					image: null,
				},
			};
		};
		const signature = createHmac("sha256", secret)
			.update(session.token)
			.digest("base64");
		const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
		const get = () =>
			auth.api.getSession({
				headers: new Headers({ cookie }),
				query: { disableCookieCache: true },
			});
		expect(Boolean(await get())).toBe(true);
		expect(reads).toBe(1);
		expect(identities).toBe(1);
		profile.mustChangePassword = true;
		expect(Boolean(await get())).toBe(true); // Session discovery remains usable for the password gate.
		expect(reads).toBe(2);
		expect(identities).toBe(2);
		profile.isActive = false;
		let denied = false;
		try {
			await get();
		} catch {
			denied = true;
		}
		expect(denied).toBe(true);
		expect(reads).toBe(3);
		expect(identities).toBe(3);
		Object.assign(profile, {
			actor: "SYSTEM_ADMIN",
			isActive: true,
			nim: "synthetic.admin",
			departmentCode: null,
			positionCode: null,
			buildingId: null,
			srUserId: null,
			isSuperadmin: true,
		});
		expect(Boolean(await get())).toBe(true);
		profile.isSuperadmin = false;
		denied = false;
		try {
			await get();
		} catch {
			denied = true;
		}
		expect(denied).toBe(true);
		expect(reads).toBe(5);
		expect(identities).toBe(5);
		context.internalAdapter.findSession = async () => {
			reads++;
			return null;
		};
		expect(await get()).toBeNull();
		expect(reads).toBe(6);
		expect(identities).toBe(5);
		context.internalAdapter.findSession = async () => {
			reads++;
			throw new Error("Synthetic store unavailable");
		};
		let unavailable = false;
		try {
			await get();
		} catch (error) {
			unavailable =
				typeof error === "object" &&
				error !== null &&
				"statusCode" in error &&
				error.statusCode === 500;
		}
		expect(unavailable).toBe(true);
		expect(reads).toBe(7);
		expect(identities).toBe(5);
	});
}
