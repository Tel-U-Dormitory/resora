import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { checkInSchema } from "../../packages/api/src/modules/attendance/attendance.schema";

// Execute the k6 script with offline runtime/HTTP/HTML doubles. No real credentials or network.
function fixture(overrides: Record<string, string> = {}, malformed = false) {
	const accounts = Array.from({ length: 50 }, (_, i) => ({
		username: `lt_resora_20261014_${String(i + 1).padStart(3, "0")}`,
		password: `synthetic-password-${i}`,
	}));
	const env: Record<string, string> = {
		VUS: "2",
		ACCOUNT_OFFSET: "0",
		APPROVE_ISOLATED_TARGET: "yes",
		TARGET_ORIGIN: "https://synthetic-preview.vercel.app",
		WEB_ORIGIN: "https://synthetic-preview.vercel.app",
		...overrides,
	};
	const metrics = new Map<string, number[]>();
	const requests: {
		method: string;
		url: string;
		options: Record<string, unknown>;
		body?: string;
	}[] = [];
	const warnings: string[] = [];
	let loginStatus = 200;
	let dashboardStatus = 200;
	let heading = "Dashboard SR";
	let hasPassword = false;
	let hasRedirect = false;
	let contentType = "text/html";
	let now = 0;
	const execution = { idInTest: 1 };
	class Metric {
		constructor(readonly name: string) {
			metrics.set(name, []);
		}
		add(value: number) {
			metrics.get(this.name)?.push(value);
		}
	}
	function SharedArrayStub(_name: string, create: () => unknown) {
		create();
		return accounts;
	}
	const source = readFileSync(new URL("loadtest.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?$/gm, "")
		.replace("export const options", "const options")
		.replace("export function setup", "function setup")
		.replace("export default function (cfg)", "function journey(cfg)");
	const runtime = runInNewContext(`${source}\n({setup,journey,options});`, {
		__ENV: env,
		open: () => {
			if (malformed) throw Error("synthetic-secret");
			return JSON.stringify({ accounts });
		},
		SharedArray: SharedArrayStub,
		Counter: Metric,
		Trend: Metric,
		vu: execution,
		Date: { now: () => now },
		console: { warn: (message: string) => warnings.push(message) },
		check: (
			response: unknown,
			assertions: Record<string, (value: unknown) => boolean>,
		) => Object.values(assertions).every((assert) => assert(response)),
		http: {
			post: (url: string, body: string, options: Record<string, unknown>) => {
				requests.push({ method: "POST", url, body, options });
				now += 30;
				return { status: loginStatus, timings: { duration: 20 } };
			},
			get: (url: string, options: Record<string, unknown>) => {
				requests.push({ method: "GET", url, options });
				now += 40;
				return {
					status: dashboardStatus,
					headers: { "Content-Type": contentType },
					timings: { duration: 35 },
					html: () => ({
						find: (selector: string) => ({
							text: () =>
								selector === "h1"
									? heading
									: selector === "h2"
										? "Selamat datang, synthetic."
										: `NIM: ${accounts[execution.idInTest - 1]?.username}`,
							size: () =>
								selector.startsWith("input")
									? Number(hasPassword)
									: Number(hasRedirect),
						}),
					}),
				};
			},
		},
	}) as {
		setup: () => { web: string; target: string };
		journey: (config: unknown) => void;
		options: {
			summaryTrendStats: string[];
			scenarios: { auth_journey: { vus: number; iterations: number } };
			thresholds: Record<string, unknown>;
		};
	};
	return {
		accounts,
		env,
		metrics,
		requests,
		warnings,
		execution,
		runtime,
		set: (values: {
			login?: number;
			dashboard?: number;
			heading?: string;
			password?: boolean;
			redirect?: boolean;
			type?: string;
		}) => {
			loginStatus = values.login ?? loginStatus;
			dashboardStatus = values.dashboard ?? dashboardStatus;
			heading = values.heading ?? heading;
			hasPassword = values.password ?? hasPassword;
			hasRedirect = values.redirect ?? hasRedirect;
			contentType = values.type ?? contentType;
		},
		sum: (name: string) => metrics.get(name)?.reduce((a, b) => a + b, 0),
	};
}

test("target guard refuses unapproved, direct API, Production and malformed targets before HTTP", () => {
	const invalidTargets: Record<string, string>[] = [
		{ APPROVE_ISOLATED_TARGET: "no" },
		{ APPROVE_ISOLATED_TARGET: "" },
		{ TARGET_ORIGIN: "https://synthetic-api.vercel.app" },
		{
			TARGET_ORIGIN: "http://isolated-resora.example.invalid",
			WEB_ORIGIN: "http://isolated-resora.example.invalid",
		},
		{
			TARGET_ORIGIN: "https://resora-telu.vercel.app",
			WEB_ORIGIN: "https://resora-telu.vercel.app",
		},
		{ TARGET_ORIGIN: "https://synthetic-preview.vercel.app/" },
		{ VUS: "51" },
		{ ACCOUNT_OFFSET: "-1" },
	];
	for (const change of invalidTargets) {
		const f = fixture(change);
		expect(() => f.runtime.setup()).toThrow();
		expect(f.requests).toHaveLength(0);
	}
});

test("isolated approval never unlocks known Production hosts, aliases or alternate ports", () => {
	for (const hostname of [
		"resora.telkomdormitory.com",
		"www.resora.telkomdormitory.com",
		"telkomdormitory.com",
		"www.telkomdormitory.com",
		"resora-telu.vercel.app",
		"resora-api.vercel.app",
	]) {
		for (const alias of [
			hostname,
			`${hostname.toUpperCase()}.:443`,
			`${hostname}:8443`,
		]) {
			const origin = `https://${alias}`;
			const f = fixture({ TARGET_ORIGIN: origin, WEB_ORIGIN: origin });
			expect(() => f.runtime.setup()).toThrow(
				"Production origins are forbidden",
			);
			expect(f.requests).toHaveLength(0);
		}
	}
});

test("verified isolated HTTPS VPS retains the authenticated journey without Preview secrets", () => {
	const origin = "https://isolated-resora.example.invalid";
	const f = fixture({
		TARGET_ORIGIN: origin,
		WEB_ORIGIN: origin,
		VERCEL_WEB_BYPASS_SECRET: "synthetic-preview-secret",
		VERCEL_BYPASS_SECRET: "synthetic-fallback-secret",
	});
	f.runtime.journey(f.runtime.setup());
	expect(f.requests.map((r) => r.url)).toEqual([
		`${origin}/api/auth/sign-in/username`,
		`${origin}/dashboard`,
	]);
	expect(f.sum("resora_journey_success")).toBe(1);
	expect(JSON.stringify(f.requests)).not.toContain("synthetic-preview-secret");
	expect(JSON.stringify(f.requests)).not.toContain("synthetic-fallback-secret");
	for (const request of f.requests)
		expect(request.options.headers).not.toHaveProperty(
			"x-vercel-protection-bypass",
		);
});

test("synthetic fixtures reject duplicates, real-style identifiers, blank passwords and malformed records", () => {
	for (const change of ["duplicate", "username", "password", "type"]) {
		const f = fixture();
		const row = f.accounts[1];
		if (!row) throw Error("Missing fixture");
		if (change === "duplicate") row.username = f.accounts[0]?.username ?? "";
		if (change === "username") row.username = "real-style-account";
		if (change === "password") row.password = "";
		if (change === "type")
			(row as unknown as { username: number }).username = 123;
		expect(() => f.runtime.setup()).toThrow();
		expect(f.requests).toHaveLength(0);
	}
});

test("same-origin journey uses one distinct account per VU and records HTTP p50/p95, counters and elapsed time", () => {
	const f = fixture();
	const config = f.runtime.setup();
	f.runtime.journey(config);
	f.execution.idInTest = 2;
	f.runtime.journey(config);
	expect(f.requests.map((r) => [r.method, r.url])).toEqual([
		["POST", `${config.web}/api/auth/sign-in/username`],
		["GET", `${config.web}/dashboard`],
		["POST", `${config.web}/api/auth/sign-in/username`],
		["GET", `${config.web}/dashboard`],
	]);
	expect(JSON.parse(f.requests[0]?.body ?? "{}").username).not.toBe(
		JSON.parse(f.requests[2]?.body ?? "{}").username,
	);
	expect(f.requests.every((r) => r.options.redirects === 0)).toBe(true);
	expect(f.sum("resora_journey_success")).toBe(2);
	expect(f.sum("resora_journey_failed")).toBe(0);
	expect(f.metrics.get("resora_journey_ms")).toEqual([70, 70]);
	expect(f.metrics.get("resora_login_ms")).toEqual([20, 20]);
	expect(f.metrics.get("resora_dashboard_ms")).toEqual([35, 35]);
	expect(f.runtime.options.summaryTrendStats).toContain("p(50)");
	expect(f.runtime.options.summaryTrendStats).toContain("p(95)");
	expect(f.runtime.options.thresholds.resora_journey_ms).toEqual([
		"p(95)<=10000",
	]);
	expect(f.warnings).toHaveLength(0);
});

test("failed login counts 429, other 4xx, 5xx/network separately and never requests dashboard or logs input", () => {
	for (const [status, metric] of [
		[429, "resora_http_429"],
		[401, "resora_http_4xx"],
		[503, "resora_http_5xx"],
		[0, "resora_network_failures"],
	] as const) {
		const f = fixture();
		f.set({ login: status });
		f.runtime.journey(f.runtime.setup());
		expect(f.sum(metric)).toBe(1);
		expect(f.sum("resora_journey_failed")).toBe(1);
		expect(f.requests).toHaveLength(1);
		expect(f.warnings[0]).toContain(`phase=LOGIN status=${status}`);
		expect(f.warnings.join()).not.toMatch(
			/synthetic|password|cookie|token|username|body/i,
		);
	}
});

test("dashboard rejects redirects, login HTML, streamed redirects, wrong headings and server/network failures", () => {
	for (const state of [
		{ dashboard: 307 },
		{ password: true },
		{ redirect: true },
		{ heading: "Masuk RESORA" },
		{ type: "application/json" },
		{ dashboard: 503 },
		{ dashboard: 0 },
	]) {
		const f = fixture();
		f.set(state);
		f.runtime.journey(f.runtime.setup());
		expect(f.sum("resora_dashboard_valid")).toBe(0);
		expect(f.sum("resora_journey_failed")).toBe(1);
		expect(f.warnings[0]).toContain("phase=DASHBOARD");
		expect(f.warnings.join()).not.toMatch(
			/synthetic|cookie|token|username|body/i,
		);
	}
});

test("malformed private fixture fails without including parse/input details", () => {
	expect(() => fixture({}, true)).toThrow(
		"Unable to read the private synthetic accounts fixture",
	);
});

test("2/5/10/20/25/50 VUs map unique synthetic identities without extra session requests", () => {
	for (const count of [2, 5, 10, 20, 25, 50]) {
		const f = fixture({ VUS: String(count) });
		const cfg = f.runtime.setup();
		expect(f.runtime.options.scenarios.auth_journey).toMatchObject({
			vus: count,
			iterations: 1,
		});
		for (let i = 1; i <= count; i++) {
			f.execution.idInTest = i;
			f.runtime.journey(cfg);
		}
		expect(
			new Set(
				f.requests
					.filter((r) => r.method === "POST")
					.map((r) => JSON.parse(r.body ?? "{}").username),
			).size,
		).toBe(count);
		expect(f.sum("resora_journey_success")).toBe(count);
		expect(f.requests).toHaveLength(count * 2);
	}
});

test("only approved Web bypass is sent on Web requests, never the separate API secret or logs", () => {
	const f = fixture({
		VERCEL_WEB_BYPASS_SECRET: "synthetic-web-bypass",
		VERCEL_API_BYPASS_SECRET: "synthetic-api-bypass",
	});
	f.runtime.journey(f.runtime.setup());
	for (const request of f.requests)
		expect(request.options.headers).toMatchObject({
			"x-vercel-protection-bypass": "synthetic-web-bypass",
		});
	expect(JSON.stringify(f.requests)).not.toContain("synthetic-api-bypass");
	expect(f.warnings).toHaveLength(0);
});

function smokeFixture(env: Record<string, string> = {}, status = 200) {
	const metrics = new Map<string, number[]>();
	const requests: { url: string; options: Record<string, unknown> }[] = [];
	class Metric {
		constructor(readonly name: string) {
			metrics.set(name, []);
		}
		add(value: number) {
			metrics.get(this.name)?.push(value);
		}
	}
	const source = readFileSync(
		new URL("smoke-public.js", import.meta.url),
		"utf8",
	)
		.replace(/^import .*;\r?$/gm, "")
		.replace("export const options", "const options")
		.replace("export function setup", "function setup")
		.replace("export default function ()", "function smoke()");
	const runtime = runInNewContext(`${source}\n({setup,smoke,options});`, {
		__ENV: env,
		Counter: Metric,
		Trend: Metric,
		check: (
			response: unknown,
			assertions: Record<string, (value: unknown) => boolean>,
		) => Object.values(assertions).every((assert) => assert(response)),
		// No POST, fixture reader, cookies, credentials or network implementation.
		http: {
			get: (url: string, options: Record<string, unknown>) => {
				requests.push({ url, options });
				return { status, timings: { duration: 15 } };
			},
		},
	}) as {
		setup: () => void;
		smoke: () => void;
		options: {
			summaryTrendStats: string[];
			scenarios: {
				public_smoke: { vus: number; iterations: number; executor: string };
			};
			thresholds: Record<string, string[]>;
		};
	};
	return { runtime, requests, metrics };
}

test("public smoke fails closed without its own approval and rejects unsafe VU counts", () => {
	const invalidEnvs: Record<string, string>[] = [
		{},
		{ APPROVE_ISOLATED_TARGET: "yes" },
		{ APPROVE_PRODUCTION_SMOKE: "true" },
		...["0", "6", "50", "1.5", "invalid"].map((count) => ({
			APPROVE_PRODUCTION_SMOKE: "yes",
			SMOKE_VUS: count,
		})),
	];
	for (const env of invalidEnvs) {
		const f = smokeFixture(env);
		expect(() => f.runtime.setup()).toThrow();
		expect(f.requests).toHaveLength(0);
	}
});

test("approved public smoke is fixed to Production /login, one GET per VU, without credentials or redirects", () => {
	for (const count of [1, 5]) {
		const f = smokeFixture({
			APPROVE_PRODUCTION_SMOKE: "yes",
			...(count === 5 ? { SMOKE_VUS: "5" } : {}),
			VUS: "50", // Auth test configuration cannot increase smoke VUs.
			TARGET_ORIGIN: "https://unapproved.example.invalid",
			ACCOUNTS_FILE: "must-not-be-read.json",
			VERCEL_WEB_BYPASS_SECRET: "must-not-be-sent",
		});
		f.runtime.setup();
		expect(f.runtime.options.scenarios.public_smoke).toMatchObject({
			executor: "per-vu-iterations",
			vus: count,
			iterations: 1,
		});
		for (let i = 0; i < count; i++) f.runtime.smoke();
		expect(f.requests).toHaveLength(count);
		for (const request of f.requests) {
			expect(request.url).toBe("https://resora.telkomdormitory.com/login");
			expect(request.options.redirects).toBe(0);
			expect(request.options).not.toHaveProperty("headers");
			expect(request.options).not.toHaveProperty("cookies");
		}
		expect(f.runtime.options.summaryTrendStats).toContain("p(50)");
		expect(f.runtime.options.summaryTrendStats).toContain("p(95)");
		expect(f.runtime.options.thresholds.resora_public_smoke_ok).toEqual([
			`count==${count}`,
		]);
		expect(f.metrics.get("resora_public_smoke_ms")).toHaveLength(count);
	}
});

test("public smoke separates success, HTTP errors (including redirects) and network failures", () => {
	for (const status of [200, 302, 429, 503, 0]) {
		const f = smokeFixture({ APPROVE_PRODUCTION_SMOKE: "yes" }, status);
		f.runtime.setup();
		f.runtime.smoke();
		const sum = (name: string) =>
			f.metrics.get(name)?.reduce((a, b) => a + b, 0);
		expect(sum("resora_public_smoke_ok")).toBe(Number(status === 200));
		expect(sum("resora_public_smoke_http_errors")).toBe(
			Number(status !== 200 && status !== 0),
		);
		expect(sum("resora_public_smoke_network_failures")).toBe(
			Number(status === 0),
		);
		expect(f.requests).toHaveLength(1);
	}
});

function qrFixture(
	overrides: Record<string, string> = {},
	brokenFixture = false,
) {
	const web =
		"https://resora-git-test-stress-test-vps-solc1us-projects.vercel.app";
	const api =
		"https://resora-api-git-test-stress-test-vps-solc1us-projects.vercel.app";
	const env = {
		WEB_ORIGIN: web,
		TARGET_ORIGIN: web,
		API_ORIGIN: api,
		APPROVE_ISOLATED_TARGET: "yes",
		APPROVE_QR_CHECKIN_TEST: "yes",
		VUS: "2",
		...overrides,
	};
	const accounts = Array.from({ length: 50 }, (_, i) => ({
		username: `lt_resora_20261014_${String(i + 1).padStart(3, "0")}`,
		password: `offline-private-${i}`,
	}));
	let now = Date.UTC(2026, 9, 19);
	const data = {
		eventId: "11111111-1111-4111-8111-111111111111",
		sessionId: "22222222-2222-4222-8222-222222222222",
		qrToken: `resora:v1:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333:${"a".repeat(64)}`,
		preparedForVus: Number(env.VUS),
		activatedAt: new Date(now - 60_000).toISOString(),
		expiresAt: new Date(now + 600_000).toISOString(),
		location: { latitude: 0, longitude: 0, accuracyMeters: 40 },
	};
	const success = [
		{
			result: {
				data: {
					status: "CHECKED_IN",
					eventName: "Offline synthetic event",
					attendanceAt: new Date(now).toISOString(),
					timingClass: "ON_TIME",
				},
			},
		},
	];
	const state = {
		login: 200,
		checkin: 200,
		errorCode: 0,
		cookie: true,
		malformed: false,
		body: success as unknown,
		loginDelay: 30,
	};
	const metrics = new Map<string, number[]>();
	const tags: Record<string, unknown>[] = [];
	const logs: string[] = [];
	const checks: boolean[] = [];
	const requests: {
		url: string;
		body: string;
		options: Record<string, unknown>;
		cookies: Record<string, string[]>;
	}[] = [];
	const execution = { idInTest: 1 };
	const jars = new Map<number, Record<string, string[]>>();
	class Metric {
		constructor(readonly name: string) {
			metrics.set(name, []);
		}
		add(value: number, tag?: Record<string, unknown>) {
			metrics.get(this.name)?.push(value);
			if (tag) tags.push(tag);
		}
	}
	function SharedArrayStub(_name: string, create: () => unknown) {
		return create();
	}
	const source = readFileSync(new URL("qr-checkin.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?$/gm, "")
		.replace("export const options", "const options")
		.replace("export function setup", "function setup")
		.replace("export default function (cfg)", "function journey(cfg)");
	const runtime = runInNewContext(
		`${source}\n({setup,journey,options,fixture,users});`,
		{
			__ENV: env,
			Counter: Metric,
			Trend: Metric,
			SharedArray: SharedArrayStub,
			vu: execution,
			Date: { now: () => now, parse: Date.parse },
			open: (path: string) => {
				if (brokenFixture) throw Error("must-not-log-private-fixture");
				return JSON.stringify(
					path.includes("qr-fixture") ? data : { accounts },
				);
			},
			console: { warn: (message: string) => logs.push(message) },
			check: (
				response: unknown,
				assertions: Record<string, (value: unknown) => boolean>,
			) => {
				const result = Object.values(assertions).every((assert) =>
					assert(response),
				);
				checks.push(result);
				return result;
			},
			http: {
				cookieJar: () => ({
					cookiesForURL: () => jars.get(execution.idInTest) || {},
				}),
				post: (url: string, body: string, options: Record<string, unknown>) => {
					requests.push({
						url,
						body,
						options,
						cookies: { ...jars.get(execution.idInTest) },
					});
					if (url.endsWith("/api/auth/sign-in/username")) {
						now += state.loginDelay;
						if (state.login === 200 && state.cookie)
							jars.set(execution.idInTest, {
								"__Secure-better-auth.session_token": [
									`private-cookie-${execution.idInTest}`,
								],
							});
						return {
							status: state.login,
							error_code: state.errorCode,
							timings: { duration: 20 },
						};
					}
					now += 40;
					return {
						status: state.checkin,
						error_code: state.errorCode,
						timings: { duration: 35 },
						json: () => {
							if (state.malformed) throw Error("private-response-body");
							return state.body;
						},
					};
				},
			},
		},
	) as {
		setup: () => { web: string };
		journey: (cfg: unknown) => void;
		fixture: typeof data;
		users: typeof accounts;
		options: {
			scenarios: { qr_checkin: { vus: number; iterations: number } };
			thresholds: Record<string, string[]>;
		};
	};
	return {
		runtime,
		data: runtime.fixture,
		accounts: runtime.users,
		state,
		requests,
		logs,
		checks,
		metrics,
		tags,
		execution,
		sum: (name: string) =>
			metrics.get(`resora_qr_${name}`)?.reduce((a, b) => a + b, 0),
	};
}

test("QR target gate requires both approvals, exact Preview pair and never accepts Production", () => {
	const invalid: Record<string, string>[] = [
		{ APPROVE_QR_CHECKIN_TEST: "" },
		{ APPROVE_ISOLATED_TARGET: "" },
		{ API_ORIGIN: "https://unverified.example.invalid" },
		{ TARGET_ORIGIN: "https://unverified.example.invalid" },
		{
			WEB_ORIGIN:
				"http://resora-git-test-stress-test-vps-solc1us-projects.vercel.app",
		},
		{
			WEB_ORIGIN:
				"https://resora-git-test-stress-test-vps-solc1us-projects.vercel.app/",
		},
		...[
			"resora.telkomdormitory.com",
			"www.resora.telkomdormitory.com",
			"telkomdormitory.com",
			"www.telkomdormitory.com",
			"resora-telu.vercel.app",
			"resora-api.vercel.app",
		].flatMap((host) =>
			["WEB_ORIGIN", "TARGET_ORIGIN", "API_ORIGIN"].map((key) => ({
				[key]: `https://${host.toUpperCase()}.:8443`,
			})),
		),
		...["1", "20", "51", "2.5", "NaN"].map((VUS) => ({ VUS })),
		{ ACCOUNT_OFFSET: "-1" },
		{ ACCOUNT_OFFSET: "49" },
	];
	for (const env of invalid) {
		const f = qrFixture(env);
		expect(() => f.runtime.setup()).toThrow();
		expect(f.requests).toHaveLength(0);
	}
	expect(qrFixture().runtime.setup().web).toContain(
		"resora-git-test-stress-test-vps",
	);
});

test("QR fixtures reject malformed tokens, mismatched sessions, expiry, future activation and invalid GPS before HTTP", () => {
	expect(() => qrFixture({}, true)).toThrow(
		"STOP: unable to read private QR/account fixture",
	);
	const changes = [
		(f: ReturnType<typeof qrFixture>) => {
			f.data.qrToken = "invalid-private-token";
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.sessionId = f.data.eventId;
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.expiresAt = "2000-01-01T00:00:00Z";
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.expiresAt = "2026-10-19T00:01:00Z";
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.activatedAt = "2099-01-01T00:00:00Z";
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.expiresAt = "not-a-date";
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.preparedForVus = 5;
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.location.latitude = 91;
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.location.longitude = -181;
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.location.accuracyMeters = 40.001;
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.data.location.accuracyMeters = 0;
		},
		(f: ReturnType<typeof qrFixture>) => {
			f.accounts[1] = f.accounts[0] as (typeof f.accounts)[1];
		},
		(f: ReturnType<typeof qrFixture>) => {
			if (f.accounts[0]) f.accounts[0].username = "real-style-identity";
		},
	];
	for (const change of changes) {
		const f = qrFixture();
		change(f);
		expect(() => f.runtime.setup()).toThrow();
		expect(f.requests).toHaveLength(0);
	}
});

test("QR 2/5/10/25/50 waves use distinct cookie jars, one login and one identical check-in per VU", () => {
	for (const count of [2, 5, 10, 25, 50]) {
		const f = qrFixture({
			VUS: String(count),
			VERCEL_WEB_BYPASS_SECRET: "private-web-bypass",
			VERCEL_API_BYPASS_SECRET: "never-forward-api-bypass",
		});
		const cfg = f.runtime.setup();
		expect(f.runtime.options.scenarios.qr_checkin).toMatchObject({
			vus: count,
			iterations: 1,
		});
		for (let i = 1; i <= count; i++) {
			f.execution.idInTest = i;
			f.runtime.journey(cfg);
		}
		const logins = f.requests.filter((r) => r.url.endsWith("/username"));
		const submissions = f.requests.filter((r) =>
			r.url.endsWith("/attendance.checkIn?batch=1"),
		);
		expect(f.requests).toHaveLength(count * 2);
		expect(new Set(logins.map((r) => JSON.parse(r.body).username)).size).toBe(
			count,
		);
		expect(
			new Set(
				submissions.map(
					(r) => r.cookies["__Secure-better-auth.session_token"]?.[0],
				),
			).size,
		).toBe(count);
		expect(new Set(submissions.map((r) => r.body)).size).toBe(1);
		for (const r of submissions) {
			expect(r.url).toBe(`${cfg.web}/trpc/attendance.checkIn?batch=1`);
			expect(r.options.headers).toEqual({
				"Content-Type": "application/json",
				Origin: cfg.web,
				"x-vercel-protection-bypass": "private-web-bypass",
			});
			expect(r.options.redirects).toBe(0);
			expect(JSON.parse(r.body)).toEqual({
				0: { qrToken: f.data.qrToken, location: f.data.location },
			});
		}
		expect(f.sum("checked_in")).toBe(count);
		expect(f.sum("already_checked_in")).toBe(0);
		expect(f.checks.every(Boolean)).toBe(true);
		expect(f.metrics.get("resora_qr_journey_ms")).toEqual(
			Array(count).fill(70),
		);
		expect(f.metrics.get("resora_qr_login_ms")).toEqual(Array(count).fill(20));
		expect(f.metrics.get("resora_qr_checkin_ms")).toEqual(
			Array(count).fill(35),
		);
		expect(f.logs).toHaveLength(0);
		expect(JSON.stringify(f.requests)).not.toContain(
			"never-forward-api-bypass",
		);
	}
});

test("QR login failures, missing cookies and expiry stop without a check-in or retry", () => {
	for (const [status, metric] of [
		[429, "login_429"],
		[401, "login_4xx"],
		[503, "login_5xx"],
		[0, "login_network_failures"],
	] as const) {
		const f = qrFixture();
		f.state.login = status;
		f.state.errorCode = status === 0 ? 1050 : 0;
		f.runtime.journey(f.runtime.setup());
		expect(f.requests).toHaveLength(1);
		expect(f.sum(metric)).toBe(1);
		expect(f.sum("login_failed")).toBe(1);
		expect(f.sum("checked_in")).toBe(0);
		expect(f.sum("login_timeouts")).toBe(Number(status === 0));
	}
	const f = qrFixture();
	f.state.cookie = false;
	f.runtime.journey(f.runtime.setup());
	expect(f.requests).toHaveLength(1);
	expect(f.sum("login_failed")).toBe(1);
	const expired = qrFixture();
	expired.state.loginDelay = 601_000;
	expired.runtime.journey(expired.runtime.setup());
	expect(expired.requests).toHaveLength(1);
	expect(expired.sum("fixture_expired")).toBe(1);
});

test("QR duplicates, tRPC errors including HTTP 200, malformed responses and transport failures never count as new writes", () => {
	const cases = [
		{
			status: 200,
			body: [
				{
					result: {
						data: {
							status: "ALREADY_CHECKED_IN",
							eventName: "Offline",
							attendanceAt: "2026-10-19T00:00:00Z",
							timingClass: "LATE",
						},
					},
				},
			],
			metric: "already_checked_in",
		},
		...[200, 403].map((status) => ({
			status,
			body: [
				{ error: { message: "NOT_INVITED", data: { code: "FORBIDDEN" } } },
			],
			metric: "business_failures",
		})),
		{
			status: 403,
			body: [{ error: { message: "QR_EXPIRED", data: { code: "FORBIDDEN" } } }],
			metric: "business_failures",
		},
		{
			status: 500,
			body: [
				{
					error: {
						message: "private-secret-raw-sql",
						data: { code: "INTERNAL_SERVER_ERROR" },
					},
				},
			],
			metric: "trpc_errors",
		},
		{
			status: 200,
			body: [
				{
					error: {
						message: "private-secret",
						data: { code: "private-user-data" },
					},
				},
			],
			metric: "trpc_errors",
		},
		{ status: 429, body: null, metric: "checkin_429" },
		{ status: 401, body: null, metric: "checkin_4xx" },
		{ status: 503, body: null, metric: "checkin_5xx" },
		{ status: 0, body: null, metric: "checkin_network_failures" },
		{
			status: 200,
			body: [{ result: { data: { status: "CHECKED_IN" } } }],
			metric: "protocol_errors",
		},
		{ status: 302, body: null, metric: "protocol_errors" },
	];
	for (const c of cases) {
		const f = qrFixture();
		f.state.checkin = c.status;
		f.state.body = c.body;
		f.state.errorCode = c.status === 0 ? 1050 : 0;
		f.runtime.journey(f.runtime.setup());
		expect(f.requests).toHaveLength(2);
		expect(f.sum(c.metric)).toBe(1);
		expect(f.sum("checked_in")).toBe(0);
		expect(f.sum("journey_failed")).toBe(1);
		expect(f.sum("checkin_timeouts")).toBe(Number(c.status === 0));
		expect(f.logs.join()).toMatch(
			/^RESORA_QR_REQUEST_FAILURE phase=CHECKIN status=\d+ outcome=[A-Z_]+$/,
		);
		expect(JSON.stringify([f.logs, f.tags, [...f.metrics.keys()]])).not.toMatch(
			/private|cookie|resora:v1|Offline|raw-sql|lt_resora/i,
		);
	}
	const malformed = qrFixture();
	malformed.state.malformed = true;
	malformed.runtime.journey(malformed.runtime.setup());
	expect(malformed.sum("protocol_errors")).toBe(1);
});

test("QR wire format matches installed frontend httpBatchLink and real tRPC parser entirely in memory", async () => {
	const require = createRequire(
		new URL("../../packages/api/package.json", import.meta.url),
	);
	const { createTRPCUntypedClient, httpBatchLink } = require("@trpc/client");
	const { initTRPC } = require("@trpc/server");
	const { fetchRequestHandler } = require("@trpc/server/adapters/fetch");
	const f = qrFixture();
	f.runtime.journey(f.runtime.setup());
	const submitted = f.requests[1];
	if (!submitted) throw Error("Missing offline submission");
	const input = JSON.parse(submitted.body)[0];
	let calls = 0;
	const t = initTRPC.create();
	const router = t.router({
		attendance: t.router({
			checkIn: t.procedure
				.input(checkInSchema)
				.mutation(({ input: received }: { input: unknown }) => {
					expect(received).toEqual(input);
					return {
						status: "CHECKED_IN",
						eventName: "Offline",
						attendanceAt: new Date(0),
						timingClass: "EARLY",
					};
				}),
		}),
	});
	const client = createTRPCUntypedClient({
		links: [
			httpBatchLink({
				url: `${f.runtime.setup().web}/trpc`,
				fetch: async (url: string, options: RequestInit) => {
					calls++;
					expect(String(url)).toBe(submitted.url);
					expect(options.method).toBe("POST");
					expect(options.body).toBe(submitted.body);
					return fetchRequestHandler({
						endpoint: "/trpc",
						req: new Request(url, options),
						router,
						createContext: () => ({}),
					});
				},
			}),
		],
	});
	const result = await client.mutation("attendance.checkIn", input);
	expect(result.status).toBe("CHECKED_IN");
	expect(result.attendanceAt).toBe("1970-01-01T00:00:00.000Z");
	expect(calls).toBe(1);
});
