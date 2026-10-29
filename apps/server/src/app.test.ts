import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Auth } from "@resora/auth";
import type { Database } from "@resora/db";
import { attendanceAuditLogs } from "@resora/db/schema/attendance";
import { userPermissionGrants, userProfiles } from "@resora/db/schema/identity";
import { createApp, resolveClientIp } from "./app";
import { DatabaseBackupError } from "./database-backup";

const origin = "http://localhost:3001";
let server: Server;
let base: string;
let sessions = 0;
let writes = 0;
let identity: Record<string, unknown> | null = null;
let failContext = false;
let failAuth = false;
let failQuery = false;
let authStatus: number | undefined;
let manualGrant: { userId: string; revokedAt: Date | null } | null = null;
let grantReads = 0;
function queryFor(table: unknown) {
	const query = {
		innerJoin: () => query,
		leftJoin: () => query,
		where: () => {
			if (failQuery) throw new Error("synthetic-private-query");
			if (table === userProfiles)
				return Promise.resolve(
					identity ? [{ tenureStatus: "ACTIVE", ...identity }] : [],
				);
			if (table === userPermissionGrants) {
				grantReads++;
				return Promise.resolve(
					manualGrant?.userId === identity?.userId &&
						manualGrant?.revokedAt === null
						? [{ userId: manualGrant.userId }]
						: [],
				);
			}
			if (table === attendanceAuditLogs)
				return {
					orderBy: () => ({ limit: () => ({ offset: async () => [] }) }),
				};
			throw new Error("Unexpected offline database read");
		},
	};
	return query;
}
const db = {
	$client: { totalCount: 1, idleCount: 0, waitingCount: 3 },
	select: () => ({ from: queryFor }),
	transaction: () => {
		writes++;
		throw new Error("Unexpected offline database write");
	},
} as unknown as Database;
const auth = {
	options: { secret: "synthetic-http-security-test-secret-0000000" },
	handler: async (request: Request) => {
		if (failAuth) throw new Error("synthetic-private-store-credential");
		if (authStatus)
			return new Response("synthetic-private-response", {
				status: authStatus,
				headers: { "x-retry-after": "60" },
			});
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
	failQuery = false;
	authStatus = undefined;
	manualGrant = null;
	grantReads = 0;
});

test("initial-password SR can use protected API; live grant adds the mandatory gate", async () => {
	identity = { ...identity, mustChangePassword: true };
	expect((await fetch(`${base}/trpc/privateData`)).status).toBe(200);
	const response = await fetch(`${base}/trpc/identity.session`);
	expect(response.status).toBe(200);
	expect(
		((await response.json()) as { result: { data: unknown } }).result.data,
	).toMatchObject({
		mustChangePassword: true,
		requiresPasswordChange: false,
		canManageInternalEvents: true,
		canManageInternalAttendanceManually: true,
	});
	identity = { ...identity, isSuperadmin: true };
	expect((await fetch(`${base}/trpc/privateData`)).status).toBe(403);
	identity = { ...identity, actor: "SYSTEM_ADMIN", srUserId: null };
	expect((await fetch(`${base}/trpc/privateData`)).status).toBe(403);
	identity = { ...identity, mustChangePassword: false };
	expect((await fetch(`${base}/trpc/privateData`)).status).toBe(200);
	identity = { ...identity, isSuperadmin: false };
	expect((await fetch(`${base}/trpc/privateData`)).status).toBe(401);
});

test("session/tRPC 5xx diagnostics cover context and resolver failures without sensitive fields", async () => {
	const records: unknown[][] = [];
	const log = spyOn(console, "info").mockImplementation(
		(...args: unknown[]) => {
			records.push(args);
		},
	);
	try {
		for (const [path, operation, failure, status, outcome] of [
			["/api/auth/get-session", "AUTH_SESSION", "auth", 503, "UNAVAILABLE"],
			["/trpc/identity.session", "IDENTITY_SESSION", "context", 500, "ERROR"],
			["/trpc/identity.session", "IDENTITY_SESSION", "query", 500, "ERROR"],
			["/trpc/privateData", "TRPC", "query", 500, "ERROR"],
			[
				"/trpc/privateData,identity.session?batch=1",
				"TRPC",
				"context",
				500,
				"ERROR",
			],
		] as const) {
			failAuth = failure === "auth";
			failContext = failure === "context";
			failQuery = failure === "query";
			const result = await fetch(
				`${base}${path}${path.includes("?") ? "&" : "?"}sensitive=synthetic-query-secret`,
				{
					headers: { cookie: "synthetic-cookie-secret" },
				},
			);
			expect(result.status).toBe(status);
			expect(await result.text()).not.toContain("synthetic-private");
			const record = records.at(-1)?.[1] as Record<string, unknown>;
			expect(record).toMatchObject({
				operation,
				status,
				outcome,
				poolTotal: 1,
				poolIdle: 0,
				poolWaiting: 3,
			});
			expect(typeof record.durationMs).toBe("number");
			expect(record.durationMs as number).toBeGreaterThanOrEqual(0);
			expect(Object.keys(record).sort()).toEqual([
				"durationMs",
				"operation",
				"outcome",
				"poolIdle",
				"poolTotal",
				"poolWaiting",
				"status",
			]);
		}
		expect(records).toHaveLength(5);
		expect(JSON.stringify(records)).not.toMatch(
			/synthetic|cookie|secret|query|127\.0|postgresql|stack/i,
		);
		failAuth = failContext = failQuery = false;
		for (const path of [
			"/api/auth/get-session",
			"/trpc/identity.session",
			"/trpc/privateData",
		])
			expect((await fetch(`${base}${path}`)).status).toBe(200);
		identity = null;
		expect((await fetch(`${base}/trpc/privateData`)).status).toBe(401);
		authStatus = 429;
		expect((await fetch(`${base}/api/auth/get-session`)).status).toBe(429);
		expect(records).toHaveLength(5); // Session success and non-5xx responses stay quiet.
	} finally {
		log.mockRestore();
	}
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
test("direct HTTP denies manual/audit for ordinary HCO, other KADEP, Adaptif and unprivileged SR", async () => {
	for (const [departmentCode, positionCode, isSuperadmin] of [
		["HCO", "ANGGOTA", false],
		["HCO", "SEKDEP", false],
		["ADAPTIF", "KADEP", false],
		["ADAPTIF", "ANGGOTA", false],
		["SOSIAL", "ANGGOTA", false],
		["RND", "KADEP", false],
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
	expect(grantReads).toBe(6); // Insert, correction and audit for both ordinary HCO positions.
});

test("HTTP manual capability and audit distinguish intrinsic access from explicit active grants", async () => {
	for (const positionCode of ["KADEP", "SEKDEP", "ANGGOTA"]) {
		identity = { ...identity, positionCode };
		for (const grant of [
			null,
			{ userId: "other-user", revokedAt: null },
			{ userId: "synthetic-http-sr", revokedAt: new Date() },
			{ userId: "synthetic-http-sr", revokedAt: null },
		]) {
			manualGrant = grant;
			const allowed =
				positionCode === "KADEP" ||
				(grant?.userId === "synthetic-http-sr" && grant.revokedAt === null);
			const response = await fetch(`${base}/trpc/identity.session`);
			expect(response.status).toBe(200);
			expect(
				(
					(await response.json()) as {
						result: { data: { canManageInternalAttendanceManually: boolean } };
					}
				).result.data.canManageInternalAttendanceManually,
			).toBe(allowed);
			const audit = await fetch(
				`${base}/trpc/attendance.auditHistory?input=${encodeURIComponent(JSON.stringify({ eventId: randomUUID(), userId: "synthetic" }))}`,
			);
			expect(audit.status).toBe(allowed ? 200 : 403);
		}
	}
	expect(writes).toBe(0);
});
test("inactive and first-password-change users denied; forged input cannot elevate/read another history", async () => {
	for (const [isActive, mustChangePassword, status] of [
		[false, false, 401],
		[true, true, 403],
	] as const) {
		identity = {
			...identity,
			isActive,
			mustChangePassword,
			isSuperadmin: true,
		};
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

test("IP resolver accepts only a single valid address from the selected trusted source", () => {
	for (const ip of ["198.51.100.70", "2001:db8::70"]) {
		expect(resolveClientIp("127.0.0.1", ip, true)).toBe(ip);
		expect(resolveClientIp(ip, "198.51.100.99", false)).toBe(ip);
	}
	for (const header of [
		undefined,
		"",
		"invalid",
		"198.51.100.70, 198.51.100.71",
		["198.51.100.70"],
	]) {
		expect(resolveClientIp("192.0.2.1", header, true)).toBe("127.0.0.1");
	}
	expect(resolveClientIp(undefined, "198.51.100.70", false)).toBe("127.0.0.1");
	expect(resolveClientIp("invalid", "198.51.100.70", false)).toBe("127.0.0.1");
});

test("Vercel auth overwrites spoofed limiter/forwarding headers and never skips invalid IPs", async () => {
	const previous = process.env.VERCEL;
	let vercelApp: ReturnType<typeof createApp>;
	try {
		process.env.VERCEL = "1";
		vercelApp = createApp({ db, auth }, origin);
	} finally {
		if (previous === undefined) delete process.env.VERCEL;
		else process.env.VERCEL = previous;
	}
	expect(vercelApp.get("trust proxy")).toBe(false);
	const listener = vercelApp.listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => listener.once("listening", resolve));
	const address = listener.address() as AddressInfo;
	try {
		for (const header of [
			"198.51.100.70",
			"2001:db8::70",
			"",
			"invalid",
			"198.51.100.70, 198.51.100.71",
			undefined,
		]) {
			const headers: Record<string, string> = {
				"x-resora-client-ip": "198.51.100.99",
				"x-forwarded-for": "198.51.100.98",
				"x-real-ip": "198.51.100.97",
			};
			if (header !== undefined) headers["x-vercel-forwarded-for"] = header;
			const response = await fetch(
				`http://127.0.0.1:${address.port}/api/auth/synthetic-ip-probe`,
				{ headers },
			);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe(
				header === "198.51.100.70" || header === "2001:db8::70"
					? header
					: "127.0.0.1",
			);
		}
	} finally {
		await new Promise<void>((resolve, reject) =>
			listener.close((error) => (error ? reject(error) : resolve())),
		);
	}
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

test("auth preserves credential rejection/429/success and sanitizes returned internal errors with safe diagnostics", async () => {
	const records: unknown[][] = [];
	const log = spyOn(console, "info").mockImplementation(
		(...args: unknown[]) => {
			records.push(args);
		},
	);
	try {
		for (const [upstream, expected, outcome] of [
			[200, 200, "SUCCESS"],
			[401, 401, "REJECTED"],
			[429, 429, "RATE_LIMITED"],
			[500, 503, "UNAVAILABLE"],
			[503, 503, "UNAVAILABLE"],
		] as const) {
			authStatus = upstream;
			const response = await fetch(`${base}/api/auth/sign-in/username`, {
				method: "POST",
				headers: { origin, "content-type": "application/json" },
				body: "{}",
			});
			expect(response.status).toBe(expected);
			expect(response.headers.get("cache-control")).toBe("no-store");
			if (expected === 429)
				expect(response.headers.get("x-retry-after")).toBe("60");
			if (expected === 503) {
				expect(await response.json()).toEqual({
					code: "AUTH_UNAVAILABLE",
					message: "Authentication service unavailable",
				});
				expect(records.at(-1)?.[1]).toMatchObject({
					poolTotal: 1,
					poolIdle: 0,
					poolWaiting: 3,
				});
			}
			expect(records.at(-1)?.[0]).toBe("AUTH_REQUEST_RESULT");
			expect(records.at(-1)?.[1]).toMatchObject({
				operation: "LOGIN",
				status: expected,
				outcome,
			});
		}
		expect(JSON.stringify(records)).not.toMatch(
			/synthetic-private|password|cookie|198\.51|127\.0|postgresql|token/i,
		);
	} finally {
		log.mockRestore();
	}
});

test("opt-in latency diagnostics log only targeted successes with safe request/session timing", async () => {
	const listener = createApp(
		{ db, auth, authPerfDiagnosticsEnabled: true },
		origin,
	).listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => listener.once("listening", resolve));
	const address = listener.address() as AddressInfo;
	const diagnosticBase = `http://127.0.0.1:${address.port}`;
	const records: unknown[][] = [];
	const log = spyOn(console, "info").mockImplementation(
		(...args: unknown[]) => {
			records.push(args);
		},
	);
	try {
		const paths = [
			["/api/auth/sign-in/username", "LOGIN", "POST"],
			["/api/auth/get-session", "AUTH_SESSION", "GET"],
			["/trpc/identity.session", "IDENTITY_SESSION", "GET"],
			["/trpc/privateData", "DASHBOARD_DATA", "GET"],
		] as const;
		for (const [path, operation, method] of paths) {
			const response = await fetch(
				`${diagnosticBase}${path}?private=synthetic-query-secret`,
				{
					method,
					headers: {
						origin,
						cookie: "synthetic-cookie-secret",
						authorization: "Bearer synthetic-token-secret",
						"content-type": "application/json",
					},
					...(method === "POST"
						? {
								body: JSON.stringify({
									username: "synthetic-private-nim",
									password: "synthetic-private-password",
								}),
							}
						: {}),
				},
			);
			expect(response.status).toBe(200);
			await response.text();
			const record = records.at(-1)?.[1] as Record<string, unknown>;
			expect(record).toMatchObject({
				operation,
				status: 200,
				outcome: "SUCCESS",
				poolTotal: 1,
				poolIdle: 0,
				poolWaiting: 3,
			});
			expect(record.durationMs).toBeGreaterThanOrEqual(0);
			const keys = [
				"durationMs",
				"operation",
				"outcome",
				"poolIdle",
				"poolTotal",
				"poolWaiting",
				"status",
			];
			if (path.startsWith("/trpc/")) {
				keys.push("sessionLookupDurationMs");
				expect(record.sessionLookupDurationMs).toBeGreaterThanOrEqual(0);
			}
			expect(Object.keys(record).sort()).toEqual(keys.sort());
		}
		expect(sessions).toBe(2); // Exactly one authoritative lookup for each tRPC request.
		const batch = await fetch(
			`${diagnosticBase}/trpc/privateData,identity.session?batch=1`,
		);
		expect(batch.status).toBe(200);
		await batch.text();
		expect(sessions).toBe(3); // A batch shares one context; diagnostics never re-read storage.
		expect(
			records
				.slice(-2)
				.map((row) => (row[1] as Record<string, unknown>).operation),
		).toEqual(["IDENTITY_SESSION", "DASHBOARD_DATA"]);
		for (const row of records.slice(-2))
			expect(row[1]).toMatchObject({ batched: true, status: 200 });
		const batchDurations = records
			.slice(-2)
			.map((row) => (row[1] as Record<string, unknown>).durationMs);
		expect(batchDurations[0]).toBe(batchDurations[1]);
		expect(records).toHaveLength(6);
		await (await fetch(`${diagnosticBase}/trpc/healthCheck`)).text();
		await (await fetch(`${diagnosticBase}/`)).text();
		expect(records).toHaveLength(6); // No new global tRPC or health-success logging.
		expect(JSON.stringify(records)).not.toMatch(
			/synthetic|cookie|password|token|authorization|postgresql|127\.0|stack|headers|username/i,
		);
	} finally {
		log.mockRestore();
		await new Promise<void>((resolve, reject) =>
			listener.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("opt-in diagnostics retain final error status and session timing for context/resolver failures", async () => {
	const listener = createApp(
		{ db, auth, authPerfDiagnosticsEnabled: true },
		origin,
	).listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => listener.once("listening", resolve));
	const address = listener.address() as AddressInfo;
	const records: unknown[][] = [];
	const log = spyOn(console, "info").mockImplementation(
		(...args: unknown[]) => {
			records.push(args);
		},
	);
	try {
		for (const contextFailure of [true, false]) {
			failContext = contextFailure;
			failQuery = !contextFailure;
			const response = await fetch(
				`http://127.0.0.1:${address.port}/trpc/identity.session?private=synthetic-query-secret`,
			);
			expect(response.status).toBe(500);
			expect(await response.text()).not.toContain("synthetic-private");
			const record = records.at(-1)?.[1] as Record<string, unknown>;
			expect(record).toMatchObject({
				operation: "IDENTITY_SESSION",
				status: 500,
				outcome: "ERROR",
				poolTotal: 1,
				poolIdle: 0,
				poolWaiting: 3,
			});
			expect(record.sessionLookupDurationMs).toBeGreaterThanOrEqual(0);
			expect(Object.keys(record).sort()).toEqual([
				"durationMs",
				"operation",
				"outcome",
				"poolIdle",
				"poolTotal",
				"poolWaiting",
				"sessionLookupDurationMs",
				"status",
			]);
		}
		expect(records).toHaveLength(2);
		expect(JSON.stringify(records)).not.toMatch(
			/synthetic|cookie|password|token|postgresql|stack/i,
		);
	} finally {
		log.mockRestore();
		await new Promise<void>((resolve, reject) =>
			listener.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("backup endpoint enforces origin, current session, explicit SUPERADMIN and password gates before exporting", async () => {
	let calls = 0;
	const listener = createApp(
		{
			db,
			auth,
			backup: async () => {
				calls++;
				throw new Error("synthetic-private-password");
			},
		},
		origin,
	).listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => listener.once("listening", resolve));
	const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/admin/database-backup`;
	try {
		for (const requestOrigin of [
			undefined,
			"https://foreign.invalid",
			"null",
		]) {
			expect(
				(
					await fetch(url, {
						method: "POST",
						headers: requestOrigin ? { origin: requestOrigin } : undefined,
					})
				).status,
			).toBe(403);
		}
		for (const [candidate, status] of [
			[null, 401],
			[{ ...identity, isSuperadmin: false }, 403],
			[{ ...identity, isSuperadmin: true, isActive: false }, 401],
			[{ ...identity, isSuperadmin: true, mustChangePassword: true }, 403],
		] as const) {
			identity = candidate;
			expect(
				(await fetch(url, { method: "POST", headers: { origin } })).status,
			).toBe(status);
		}
		expect(calls).toBe(0);
		identity = {
			actor: "SYSTEM_ADMIN",
			userId: "synthetic-admin",
			nim: "resora.admin",
			isActive: true,
			mustChangePassword: false,
			isSuperadmin: true,
		};
		const failure = await fetch(url, { method: "POST", headers: { origin } });
		expect(failure.status).toBe(503);
		expect(await failure.text()).not.toContain("synthetic-private");
		expect(failure.headers.get("cache-control")).toBe("no-store");
		expect((await fetch(url)).status).toBe(404);
		expect(calls).toBe(1);
	} finally {
		await new Promise<void>((resolve) => listener.close(() => resolve()));
	}
});

test("backup download is private, rechecks revoked privileges and cleans up on success or rejection", async () => {
	const directory = await mkdtemp(join(tmpdir(), "resora-http-backup-test-"));
	const path = join(directory, "synthetic.dump");
	await writeFile(path, "synthetic-backup-bytes");
	let cleaned = 0;
	let revoked = false;
	let busy = false;
	const listener = createApp(
		{
			db,
			auth,
			backup: async () => {
				if (busy) throw new DatabaseBackupError("BACKUP_BUSY");
				if (revoked) identity = { ...identity, isSuperadmin: false };
				return {
					path,
					filename: "resora-2026-10-16T00-00-00-000Z.dump",
					cleanup: async () => {
						cleaned++;
					},
				};
			},
		},
		origin,
	).listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => listener.once("listening", resolve));
	const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/admin/database-backup`;
	try {
		identity = { ...identity, isSuperadmin: true };
		const response = await fetch(url, {
			method: "POST",
			headers: { origin, range: "bytes=0-2" },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toContain(
			"attachment;",
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("access-control-expose-headers")).toContain(
			"Content-Disposition",
		);
		expect(await response.text()).toBe("synthetic-backup-bytes");
		await Bun.sleep(10);
		expect(cleaned).toBe(1);
		busy = true;
		expect(
			(await fetch(url, { method: "POST", headers: { origin } })).status,
		).toBe(409);
		busy = false;
		revoked = true;
		const rejected = await fetch(url, { method: "POST", headers: { origin } });
		expect(rejected.status).toBe(403);
		expect(await rejected.text()).not.toContain("synthetic-backup-bytes");
		await Bun.sleep(10);
		expect(cleaned).toBe(2);
	} finally {
		await new Promise<void>((resolve) => listener.close(() => resolve()));
		await rm(directory, { recursive: true, force: true });
	}
});

test("expired, future and unassigned SR cannot use protected HTTP even with SUPERADMIN", async () => {
	for (const tenureStatus of ["EXPIRED", "SCHEDULED", "UNASSIGNED"]) {
		identity = { ...identity, tenureStatus, isSuperadmin: true };
		expect((await fetch(`${base}/trpc/privateData`)).status).toBe(401);
	}
});

test("public password change fails closed without transaction-bound auth configuration", async () => {
	const response = await fetch(`${base}/api/auth/change-password`, {
		method: "POST",
		headers: { origin, "content-type": "application/json" },
		body: JSON.stringify({
			currentPassword: "synthetic-current",
			newPassword: "synthetic-new",
		}),
	});
	expect(response.status).toBe(503);
});

test("authenticated proxy selects its IP and removes the ingress secret before auth", async () => {
	const secret = "synthetic-http-proxy-secret-000000000000000";
	const proxyAuth = {
		...auth,
		handler: async (request: Request) =>
			Response.json({
				ip: request.headers.get("x-resora-client-ip"),
				token: request.headers.get("x-resora-proxy-token"),
			}),
	} as Auth;
	const app = createApp(
		{ db, auth: proxyAuth, authProxySecret: secret },
		origin,
	);
	const listener = app.listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => listener.once("listening", resolve));
	try {
		const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/auth/synthetic-ip-probe`;
		const result = await fetch(url, {
			headers: {
				"x-resora-client-ip": "2001:db8::70",
				"x-resora-proxy-token": secret,
				"x-forwarded-for": "198.51.100.99",
			},
		});
		expect(await result.json()).toEqual({ ip: "2001:db8::70", token: null });
		expect(
			(await fetch(url, { headers: { "x-resora-client-ip": "198.51.100.99" } }))
				.status,
		).toBe(403);
	} finally {
		await new Promise<void>((resolve, reject) =>
			listener.close((error) => (error ? reject(error) : resolve())),
		);
	}
	expect(() =>
		createApp({ db, auth, authProxySecret: "short" }, origin),
	).toThrow("AUTH_PROXY_SECRET");
});
