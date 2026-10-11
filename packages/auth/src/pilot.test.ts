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

test("pilot enables memory rate limiting and authoritative sessions without schema changes", () => {
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
		},
		db,
	);
	expect(secureAuth.options.advanced.defaultCookieAttributes.secure).toBe(true);
});
