import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Auth } from "@resora/auth";
import type { Database } from "@resora/db";
import { createApp } from "./app";

const origin = "http://localhost:3001";
let server: Server;
let base: string;
let sessions = 0;
let writes = 0;
let identity: Record<string, unknown> | null = null;
let failContext = false;
let failAuth = false;
const query = {
	innerJoin: () => query,
	leftJoin: () => query,
	where: async () => (identity ? [identity] : []),
};
const db = {
	select: () => ({ from: () => query }),
	transaction: () => {
		writes++;
		throw new Error("Unexpected offline database write");
	},
} as unknown as Database;
const auth = {
	options: { secret: "synthetic-http-security-test-secret-0000000" },
	handler: async (request: Request) => {
		if (failAuth) throw new Error("synthetic-private-store-credential");
		return new Response(request.headers.get("x-resora-client-ip"));
	},
	api: {
		getSession: async () => {
			sessions++;
			if (failContext) throw new Error("synthetic-private-password-token-GPS");
			return identity ? { user: { id: "synthetic-http-sr" } } : null;
		},
	},
} as unknown as Auth;

beforeAll(async () => {
	server = createApp({ db, auth }, origin).listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => server.once("listening", resolve));
	const address = server.address() as AddressInfo;
	base = `http://127.0.0.1:${address.port}`;
});
afterAll(
	() =>
		new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		),
);

beforeEach(() => {
	identity = {
		userId: "synthetic-http-sr",
		actor: "SR",
		isActive: true,
		mustChangePassword: false,
		nim: "0000000001",
		departmentCode: "HCO",
		positionCode: "KADEP",
		buildingId: randomUUID(),
		isSuperadmin: false,
	};
	sessions = 0;
	writes = 0;
	failContext = false;
	failAuth = false;
});

async function post(
	path: string,
	input: unknown,
	requestOrigin: string | null = origin,
) {
	return fetch(`${base}/trpc/${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(requestOrigin ? { origin: requestOrigin } : {}),
		},
		body: JSON.stringify(input),
	});
}

test("HTTP security headers and private API cache policy", async () => {
	const response = await fetch(`${base}/`);
	expect(response.headers.get("x-powered-by")).toBeNull();
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(response.headers.get("referrer-policy")).toBe(
		"strict-origin-when-cross-origin",
	);
	const api = await fetch(`${base}/trpc/identity.session`);
	expect(api.headers.get("cache-control")).toBe("no-store");
});
test("exact CORS origin: allowed preflight, foreign preflight denied", async () => {
	const good = await fetch(`${base}/trpc/attendance.manualInsert`, {
		method: "OPTIONS",
		headers: {
			origin,
			"access-control-request-method": "POST",
			"access-control-request-headers": "content-type",
		},
	});
	expect(good.status).toBe(204);
	expect(good.headers.get("access-control-allow-origin")).toBe(origin);
	expect(good.headers.get("access-control-allow-credentials")).toBe("true");
	const foreign = await fetch(`${base}/trpc/attendance.manualInsert`, {
		method: "OPTIONS",
		headers: {
			origin: "https://untrusted.example.invalid",
			"access-control-request-method": "POST",
		},
	});
	expect(foreign.status).toBe(403);
	expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
});
test("tRPC rejects absent/foreign/null Origin before session or database access", async () => {
	const before = sessions;
	for (const requestOrigin of [
		null,
		"null",
		"https://untrusted.example.invalid",
		`${origin}.untrusted.invalid`,
	]) {
		const response = await post(
			"attendance.manualInsert",
			{ eventId: randomUUID(), userId: "synthetic", reason: "reason" },
			requestOrigin,
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
	}
	expect(sessions).toBe(before);
	expect(writes).toBe(0);
});
test("originless SSR GET works; anonymous mutation still requires authentication", async () => {
	identity = null;
	const get = await fetch(`${base}/trpc/identity.session`);
	expect(get.status).toBe(200);
	const body = (await get.json()) as { result: { data: unknown } };
	expect(body.result.data).toBeNull();
	const result = await post("attendance.manualInsert", {
		eventId: randomUUID(),
		userId: "synthetic",
		reason: "reason",
	});
	expect(result.status).toBe(401);
});
test("direct HTTP denies manual/audit for ordinary HCO, other KADEP, Adaptif, normal SR and non-HCO SUPERADMIN", async () => {
	for (const [departmentCode, positionCode, isSuperadmin] of [
		["HCO", "ANGGOTA", false],
		["ADAPTIF", "KADEP", false],
		["ADAPTIF", "ANGGOTA", false],
		["SOSIAL", "ANGGOTA", false],
		["RND", "KADEP", true],
	] as const) {
		identity = {
			userId: "synthetic-http-sr",
			actor: "SR",
			isActive: true,
			mustChangePassword: false,
			nim: "0000000001",
			departmentCode,
			positionCode,
			buildingId: randomUUID(),
			isSuperadmin,
		};
		for (const [path, input] of [
			[
				"attendance.manualInsert",
				{ eventId: randomUUID(), userId: "synthetic", reason: "reason" },
			],
			[
				"attendance.manualCorrect",
				{
					attendanceId: randomUUID(),
					attendanceAt: new Date().toISOString(),
					reason: "reason",
				},
			],
		] as const)
			expect((await post(path, input)).status).toBe(403);
		const audit = await fetch(
			`${base}/trpc/attendance.auditHistory?input=${encodeURIComponent(JSON.stringify({ eventId: randomUUID(), userId: "synthetic" }))}`,
			{ headers: { origin } },
		);
		expect(audit.status).toBe(403);
	}
	expect(writes).toBe(0);
});
test("inactive and first-password-change users denied; forged input cannot elevate/read another history", async () => {
	for (const [isActive, mustChangePassword, status] of [
		[false, false, 401],
		[true, true, 403],
	] as const) {
		identity = { ...identity, isActive, mustChangePassword };
		expect(
			(
				await post("attendance.manualInsert", {
					eventId: randomUUID(),
					userId: "synthetic",
					reason: "reason",
				})
			).status,
		).toBe(status);
	}
	identity = { ...identity, isActive: true, mustChangePassword: false };
	const forged = await post("attendance.manualInsert", {
		eventId: randomUUID(),
		userId: "synthetic",
		reason: "reason",
		departmentCode: "HCO",
		positionCode: "KADEP",
		isSuperadmin: true,
	});
	expect(forged.status).toBe(400);
	const history = await fetch(
		`${base}/trpc/attendance.ownHistory?input=${encodeURIComponent(JSON.stringify({ userId: "other-user" }))}`,
	);
	expect(history.status).toBe(400);
	expect(writes).toBe(0);
});
test("internal tRPC exceptions return no sensitive message or stack", async () => {
	failContext = true;
	try {
		const result = await fetch(`${base}/trpc/identity.session`);
		const body = await result.text();
		expect(result.status).toBe(500);
		expect(body).toContain("Request could not be completed");
		expect(body).not.toContain("synthetic-private");
		expect(body).not.toContain('"stack"');
	} finally {
		failContext = false;
		identity = null;
	}
});

test("Express keeps proxy trust disabled and replaces spoofed auth limiter IP headers", async () => {
	expect(createApp({ db, auth }, origin).get("trust proxy")).toBe(false);
	const response = await fetch(`${base}/api/auth/synthetic-ip-probe`, {
		headers: {
			"x-resora-client-ip": "198.51.100.42",
			"x-forwarded-for": "198.51.100.43",
			"x-vercel-forwarded-for": "198.51.100.44",
			"x-real-ip": "198.51.100.45",
		},
	});
	expect(await response.text()).toBe("127.0.0.1");
});

test("auth storage failure returns a private no-store 503 without raw error or stack", async () => {
	failAuth = true;
	const response = await fetch(`${base}/api/auth/sign-in/username`, {
		method: "POST",
		headers: { origin, "content-type": "application/json" },
		body: "{}",
	});
	expect(response.status).toBe(503);
	expect(response.headers.get("cache-control")).toBe("no-store");
	const body = await response.text();
	expect(body).toContain("AUTH_UNAVAILABLE");
	expect(body).not.toContain("synthetic-private");
	expect(body).not.toContain("stack");
});
