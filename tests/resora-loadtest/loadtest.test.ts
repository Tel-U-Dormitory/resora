import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

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
		{ TARGET_ORIGIN: "https://synthetic-api.vercel.app" },
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

test("2/5/10/20 VUs map unique synthetic identities without extra session requests", () => {
	for (const count of [2, 5, 10, 20]) {
		const f = fixture({ VUS: String(count) });
		const cfg = f.runtime.setup();
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
