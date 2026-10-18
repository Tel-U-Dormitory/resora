import { expect, spyOn, test } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createAuth } from "@resora/auth";
import { createDb } from "@resora/db";
import { createApp, resolveProxyClientIp } from "./app";

const secret = "synthetic-proxy-only-secret-0000000000000000";
const origin = "https://telkomdormitory.com";

test("proxy IP needs an exact credential and one valid IP, never a forwarding chain", () => {
	for (const ip of ["198.51.100.1", "2001:db8::1"])
		expect(resolveProxyClientIp(ip, secret, secret)).toBe(ip);
	for (const token of [
		undefined,
		"",
		"forged",
		`${secret}x`,
		[secret],
		`${secret}, ${secret}`,
	])
		expect(resolveProxyClientIp("198.51.100.1", token, secret)).toBeUndefined();
	for (const ip of [
		undefined,
		"",
		"unknown",
		"198.51.100.1, 198.51.100.2",
		"198.51.100.1:80",
		"fe80::1%eth0",
		["198.51.100.1"],
	])
		expect(resolveProxyClientIp(ip, secret, secret)).toBeUndefined();
});

async function listen(app: ReturnType<typeof createApp>) {
	const server = app.listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => server.once("listening", resolve));
	return {
		server,
		base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
	};
}

async function close(server: Server) {
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}

test("authenticated proxy ingress keeps Better Auth per-client limits despite forged forwarding headers", async () => {
	// Actual Better Auth memory limiter, no account/session/limiter DB access.
	// Existing rate-limit.test.ts separately covers production's database consume algorithm.
	const db = createDb({
		DATABASE_URL: "postgresql://127.0.0.1:1/synthetic_proxy",
	});
	const auth = createAuth(
		{
			NODE_ENV: "development",
			BETTER_AUTH_URL: origin,
			CORS_ORIGIN: origin,
			BETTER_AUTH_SECRET: "synthetic-auth-only-secret-0000000000000000",
		},
		db,
	);
	expect(auth.options.rateLimit.storage).toBe("memory");
	const app = createApp({ db, auth, authProxySecret: secret }, origin);
	expect(app.get("trust proxy")).toBe(false);
	const { server, base } = await listen(app);
	const logs = spyOn(console, "info").mockImplementation(() => {});
	const post = (
		ip: string,
		attempt: number,
		token: string | undefined = secret,
	) =>
		fetch(`${base}/api/auth/sign-in/username`, {
			method: "POST",
			headers: {
				origin,
				"content-type": "application/json",
				"x-resora-client-ip": ip,
				...(token ? { "x-resora-proxy-token": token } : {}),
				"x-forwarded-for": `203.0.113.${(attempt % 250) + 1}`,
				"x-real-ip": `203.0.113.${(attempt % 250) + 1}`,
				"x-vercel-forwarded-for": `203.0.113.${(attempt % 250) + 1}`,
			},
			body: "{}",
		});
	try {
		for (let attempt = 0; attempt < 76; attempt++) {
			const response = await post("198.51.100.1", attempt);
			expect(response.status).toBe(attempt < 75 ? 400 : 429);
			expect(await response.text()).not.toContain(secret);
		}
		expect((await post("198.51.100.2", 100)).status).toBe(400);
		for (const token of ["", "forged", `${secret}, ${secret}`])
			expect((await post("198.51.100.3", 101, token)).status).toBe(403);
		for (const ip of ["unknown", "198.51.100.1, 198.51.100.2"])
			expect((await post(ip, 102)).status).toBe(403);
		expect((await post("198.51.100.1", 103)).status).toBe(429);
		const session = await fetch(`${base}/api/auth/get-session`, {
			headers: {
				"x-resora-client-ip": "198.51.100.2",
				"x-resora-proxy-token": secret,
			},
		});
		expect(session.status).toBe(200);
		expect(await session.json()).toBeNull();
	} finally {
		logs.mockRestore();
		await close(server);
		await db.$client.end();
	}
});
