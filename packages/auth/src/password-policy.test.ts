import { expect, test } from "bun:test";
import type { Database } from "@resora/db";
import { createAuth } from "./index";

// Real Better Auth endpoints/hooks and password hashing with isolated storage doubles.
// No PostgreSQL connection or real account is used.
for (const kind of [
	"SR",
	"RESET_SR",
	"SR_SUPERADMIN",
	"SYSTEM_ADMIN",
] as const) {
	test(`${kind}: initial login, password gate and voluntary/required rotation retain live checks`, async () => {
		const now = new Date();
		const profile = {
			userId: "synthetic-password-policy",
			actor: kind === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : "SR",
			tenureStatus: "ACTIVE",
			isActive: true,
			mustChangePassword: true,
			isSuperadmin: kind !== "SR" && kind !== "RESET_SR",
			passwordResetRequired: kind === "RESET_SR",
			nim: kind === "SYSTEM_ADMIN" ? "synthetic.admin" : "0000000001",
			srUserId: kind === "SYSTEM_ADMIN" ? null : "synthetic-password-policy",
			departmentCode: kind === "SYSTEM_ADMIN" ? null : "HCO",
			positionCode: kind === "SYSTEM_ADMIN" ? null : "KADEP",
			buildingId: kind === "SYSTEM_ADMIN" ? null : "synthetic-building",
		};
		const query = {
			innerJoin: () => query,
			leftJoin: () => query,
			where: async () => [profile],
		};
		let flagWrites = 0;
		const db = {
			select: () => ({ from: () => query }),
			update: () => ({
				set: (values: { mustChangePassword: boolean }) => ({
					where: () => ({
						returning: async () => {
							flagWrites++;
							profile.mustChangePassword = values.mustChangePassword;
							profile.passwordResetRequired = false;
							return [{ userId: profile.userId }];
						},
					}),
				}),
			}),
		} as unknown as Database;
		const auth = createAuth(
			{
				BETTER_AUTH_URL: "http://localhost:3000",
				CORS_ORIGIN: "http://localhost:3001",
				BETTER_AUTH_SECRET: "synthetic-password-policy-secret-0000000000",
				NODE_ENV: "test",
			},
			db,
		);
		const context = await auth.$context;
		const user = {
			id: profile.userId,
			name: "Synthetic account",
			email: "synthetic@example.invalid",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			image: null,
			username: profile.nim,
			displayUsername: profile.nim,
		};
		const initial = "SyntheticInitial42";
		const replacement = "SyntheticReplacement43";
		let hash = await context.password.hash(initial);
		let currentSession: Awaited<
			ReturnType<typeof context.internalAdapter.createSession>
		> | null = null;
		let revocations = 0;
		context.adapter.findOne = (async () =>
			user) as typeof context.adapter.findOne;
		context.adapter.create = (async ({ model, data }) => {
			if (model !== "session") throw new Error("Unexpected synthetic write");
			currentSession = {
				...data,
				id: "synthetic-session",
			} as unknown as NonNullable<typeof currentSession>;
			return currentSession;
		}) as typeof context.adapter.create;
		context.internalAdapter.findCredentialAccount = async () => ({
			id: "synthetic-credential",
			userId: user.id,
			accountId: user.id,
			providerId: "credential",
			password: hash,
			createdAt: now,
			updatedAt: now,
		});
		context.internalAdapter.findSession = async () =>
			currentSession ? { session: currentSession, user } : null;
		context.internalAdapter.listSessions = async () =>
			currentSession ? [currentSession] : [];
		context.internalAdapter.updateAccount = async (_id, values) => {
			hash = values.password as string;
			return {
				id: "synthetic-credential",
				userId: user.id,
				accountId: user.id,
				providerId: "credential",
				password: hash,
				createdAt: now,
				updatedAt: now,
			};
		};
		context.internalAdapter.deleteUserSessions = async () => {
			revocations++;
		};
		const request = (path: string, body: unknown, cookie = "") =>
			auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, {
					method: "POST",
					headers: {
						origin: "http://localhost:3001",
						"content-type": "application/json",
						cookie,
						"x-resora-client-ip": `192.0.2.${kind === "SR" ? 101 : kind === "SR_SUPERADMIN" ? 102 : 103}`,
					},
					body: JSON.stringify(body),
				}),
			);
		const login = await request("sign-in/username", {
			username: profile.nim,
			password: initial,
		});
		expect(login.status).toBe(200);
		expect(profile.mustChangePassword).toBe(true);
		const cookie = login.headers.get("set-cookie")?.split(";")[0];
		expect(cookie).toBeTruthy();
		const headers = new Headers({ cookie: cookie ?? "" });
		if (kind === "SR")
			expect(await auth.api.listSessions({ headers })).toHaveLength(1);
		else
			await expect(auth.api.listSessions({ headers })).rejects.toMatchObject({
				statusCode: 403,
			});
		const rejected = await request(
			"change-password",
			{ currentPassword: "SyntheticWrong44", newPassword: replacement },
			cookie,
		);
		expect(rejected.status).toBe(400);
		expect(profile.mustChangePassword).toBe(true);
		expect(flagWrites).toBe(0);
		const changed = await request(
			"change-password",
			{
				currentPassword: initial,
				newPassword: replacement,
				revokeOtherSessions: false,
			},
			cookie,
		);
		expect(changed.status).toBe(200);
		expect(profile.mustChangePassword).toBe(false);
		expect(flagWrites).toBe(1);
		expect(revocations).toBe(1); // Server forces revocation even if the caller sends false.
		expect(hash).not.toBe(replacement);
		expect(await context.password.verify({ hash, password: replacement })).toBe(
			true,
		);
		expect(await context.password.verify({ hash, password: initial })).toBe(
			false,
		);
		profile.isActive = false;
		await expect(auth.api.listSessions({ headers })).rejects.toMatchObject({
			statusCode: 401,
		});
	});
}
