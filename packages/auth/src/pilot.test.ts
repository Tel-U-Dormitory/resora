import { afterAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createDb } from "@resora/db";

import { createAuth } from "./index";

const db = createDb({
	DATABASE_URL: "postgresql://localhost:1/synthetic_phase2b",
});
const auth = createAuth(
	{
		BETTER_AUTH_URL: "http://localhost:3000",
		BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		CORS_ORIGIN: "http://localhost:3001",
		NODE_ENV: "test",
	},
	db,
);
afterAll(() => db.$client.end());

test("pilot closes public signup, email login and username enumeration before DB access", async () => {
	for (const [path, body] of [
		[
			"sign-up/email",
			{
				name: "Synthetic",
				email: "synthetic@example.invalid",
				password: randomBytes(16).toString("hex"),
			},
		],
		[
			"sign-in/email",
			{
				email: "synthetic@example.invalid",
				password: randomBytes(16).toString("hex"),
			},
		],
		["is-username-available", { username: "0000123456" }],
	] as const) {
		const response = await auth.handler(
			new Request(`http://localhost:3000/api/auth/${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3001",
					"x-resora-client-ip": "127.0.0.1",
				},
				body: JSON.stringify(body),
			}),
		);
		expect(response.status).toBe(403);
		expect(((await response.json()) as { code: string }).code).toBe(
			"PILOT_AUTH_ONLY",
		);
	}
});

test("local tests retain memory limiting and authoritative sessions; Production uses shared storage", () => {
	expect(auth.options.emailAndPassword.disableSignUp).toBe(true);
	expect(auth.options.session.cookieCache.enabled).toBe(false);
	expect(auth.options.rateLimit.enabled).toBe(true);
	expect(auth.options.rateLimit.storage).toBe("memory");
	expect(auth.options.advanced.defaultCookieAttributes).toMatchObject({
		sameSite: "lax",
		secure: false,
		httpOnly: true,
	});
	const secureAuth = createAuth(
		{
			BETTER_AUTH_URL: "https://backend.example.invalid",
			BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
			CORS_ORIGIN: "https://app.example.invalid",
			NODE_ENV: "production",
		},
		db,
	);
	expect(secureAuth.options.advanced.defaultCookieAttributes.secure).toBe(true);
	expect(secureAuth.options.rateLimit.storage).toBe("database");
	expect(secureAuth.options.rateLimit.customRules).toEqual(
		auth.options.rateLimit.customRules,
	);
});

test("auth POST rejects missing and foreign Origin before credential work", async () => {
	for (const origin of [null, "https://untrusted.example.invalid", "null"]) {
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/username", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(origin ? { origin } : {}),
					"x-resora-client-ip": "198.51.100.40",
				},
				body: JSON.stringify({
					username: "0000123456",
					password: "synthetic-password-only",
				}),
			}),
		);
		expect(response.status).toBe(403);
	}
});

test("actual auth login limiter throttles invalid body requests without connecting to database", async () => {
	const statuses: number[] = [];
	for (let attempt = 0; attempt < 76; attempt++) {
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/username", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3001",
					"x-resora-client-ip": "198.51.100.41",
				},
				// Schema rejects this before adapter/credential reads; limiter still sees real requests.
				body: JSON.stringify({
					username: 123,
					password: "synthetic-password-only",
				}),
			}),
		);
		statuses.push(response.status);
	}
	expect(statuses.slice(0, 75)).toEqual(Array(75).fill(400));
	expect(statuses[75]).toBe(429);
});

test("diagnostic limiter-off mode keeps public signup closed and Origin/cookie/session protections", async () => {
	const disabled = createAuth(
		{
			BETTER_AUTH_URL: "http://localhost:3000",
			CORS_ORIGIN: "http://localhost:3001",
			BETTER_AUTH_SECRET: "synthetic-disabled-limiter-secret-000000000",
			NODE_ENV: "test",
			AUTH_RATE_LIMIT_ENABLED: "false",
		},
		db,
	);
	expect(disabled.options.emailAndPassword.disableSignUp).toBe(true);
	expect(disabled.options.session.cookieCache.enabled).toBe(false);
	expect(disabled.options.advanced.defaultCookieAttributes).toMatchObject({
		httpOnly: true,
		sameSite: "lax",
	});
	for (const [path, origin, body] of [
		[
			"sign-in/username",
			"https://untrusted.example.invalid",
			{ username: "synthetic", password: "synthetic-only-password" },
		],
		[
			"sign-up/email",
			"http://localhost:3001",
			{
				name: "Synthetic",
				email: "synthetic@example.invalid",
				password: "synthetic-only-password",
			},
		],
	] as const) {
		const response = await disabled.handler(
			new Request(`http://localhost:3000/api/auth/${path}`, {
				method: "POST",
				headers: { origin, "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
		expect(response.status).toBe(403);
	}
});
