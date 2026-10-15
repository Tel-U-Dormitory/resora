// RESORA controlled authentication load test (Grafana k6).
// Use ONLY against an isolated, approved local/Preview environment.
// One synthetic account: Web login, then authenticated dashboard SSR per VU.

import { check } from "k6";
import { SharedArray } from "k6/data";
import { vu } from "k6/execution";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const users = new SharedArray("approved synthetic accounts", () => {
	let raw;
	try {
		raw = JSON.parse(open(__ENV.ACCOUNTS_FILE || "./accounts.local.json"));
	} catch (_) {
		throw new Error("Unable to read the private synthetic accounts fixture");
	}
	if (!Array.isArray(raw.accounts))
		throw new Error("Expected an accounts array in the private fixture");
	return raw.accounts;
});

const vus = Number(__ENV.VUS || "2");
const offset = Number(__ENV.ACCOUNT_OFFSET || "0");
const webBypassSecret =
	__ENV.VERCEL_WEB_BYPASS_SECRET || __ENV.VERCEL_BYPASS_SECRET;
const loginOk = new Counter("resora_login_200");
const loginLimited = new Counter("resora_login_429");
const login5xx = new Counter("resora_login_5xx");
const loginOther = new Counter("resora_login_other");
const dashboardOk = new Counter("resora_dashboard_valid");
const dashboard5xx = new Counter("resora_dashboard_5xx");
const dashboardOther = new Counter("resora_dashboard_other");
const journeyOk = new Counter("resora_journey_success");
const journeyFailed = new Counter("resora_journey_failed");
const http429 = new Counter("resora_http_429");
const http4xx = new Counter("resora_http_4xx"); // Excludes 429 (reported separately).
const http5xx = new Counter("resora_http_5xx");
const networkFailures = new Counter("resora_network_failures");
const loginMs = new Trend("resora_login_ms", true);
const dashboardMs = new Trend("resora_dashboard_ms", true);
const journeyMs = new Trend("resora_journey_ms", true);

export const options = {
	summaryTrendStats: ["min", "p(50)", "p(95)", "max"],
	scenarios: {
		auth_journey: {
			executor: "per-vu-iterations",
			vus,
			iterations: 1,
			maxDuration: "90s",
			gracefulStop: "0s",
		},
	},
	// A simultaneous wave may already be in flight. Never escalate VUs after a failed run.
	thresholds: {
		checks: ["rate==1"],
		resora_journey_success: [`count==${vus}`],
		resora_journey_failed: ["count==0"],
		resora_journey_ms: ["p(95)<=10000"],
		resora_http_429: ["count==0"],
		resora_http_4xx: ["count==0"],
		resora_http_5xx: [
			{ threshold: "count==0", abortOnFail: true, delayAbortEval: "5s" },
		],
		resora_network_failures: ["count==0"],
	},
};

export function setup() {
	if (__ENV.APPROVE_ISOLATED_TARGET !== "yes") {
		throw new Error(
			"STOP: set APPROVE_ISOLATED_TARGET=yes only after verifying test DB isolation",
		);
	}
	const target = __ENV.TARGET_ORIGIN || "";
	const web = __ENV.WEB_ORIGIN || "";
	const originPattern =
		/^https?:\/\/(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d+)?$/;
	if (!originPattern.test(target) || !originPattern.test(web)) {
		throw new Error(
			"TARGET_ORIGIN and WEB_ORIGIN must be HTTP(S) origins without paths or trailing slashes",
		);
	}
	if (target !== web || !target.startsWith("https://"))
		throw new Error(
			"STOP: this journey must use the same verified HTTPS Preview Web origin for both requests",
		);
	if (/^https:\/\/resora-telu\.vercel\.app(?::443)?$/i.test(target))
		throw new Error("STOP: Production Web is forbidden");
	if (!Number.isInteger(vus) || vus < 1 || vus > 50)
		throw new Error("VUS must be 1..50");
	if (!Number.isInteger(offset) || offset < 0)
		throw new Error("ACCOUNT_OFFSET must be >= 0");
	if (users.length < offset + vus)
		throw new Error(
			"Not enough distinct synthetic accounts for requested VUS/offset",
		);
	const selected = new Set();
	for (let i = offset; i < offset + vus; i++) {
		const account = users[i];
		const suffix =
			typeof account?.username === "string"
				? Number(account.username.slice(-3))
				: Number.NaN;
		if (
			typeof account?.username !== "string" ||
			!/^lt_resora_20261014_\d{3}$/.test(account.username) ||
			suffix < 1 ||
			suffix > 50 ||
			typeof account.password !== "string" ||
			!account.password ||
			account.password.startsWith("REPLACE_") ||
			selected.has(account.username)
		)
			throw new Error(
				`Invalid, duplicate or unapproved synthetic account at index ${i}`,
			);
		selected.add(account.username);
	}
	return { target, web };
}

function reportFailure(phase, status) {
	const httpStatus = Number.isInteger(status) ? status : 0;
	const classification =
		httpStatus === 429
			? "RATE_LIMITED"
			: httpStatus === 401
				? "UNAUTHORIZED"
				: httpStatus === 403
					? "FORBIDDEN"
					: httpStatus >= 300 && httpStatus < 400
						? "REDIRECT"
						: httpStatus >= 500
							? "SERVER_ERROR"
							: httpStatus === 0
								? "NETWORK_ERROR"
								: phase === "DASHBOARD" && httpStatus === 200
									? "UNAUTHENTICATED_DASHBOARD"
									: "OTHER";
	console.warn(
		`RESORA_REQUEST_FAILURE phase=${phase} status=${httpStatus} classification=${classification}`,
	);
}

function countHttpFailure(status) {
	if (status === 0) networkFailures.add(1);
	else if (status === 429) http429.add(1);
	else if (status >= 400 && status < 500) http4xx.add(1);
	else if (status >= 500) http5xx.add(1);
}

function authenticatedDashboard(response, username) {
	if (
		response.status !== 200 ||
		!String(response.headers["Content-Type"] || "").includes("text/html")
	)
		return false;
	try {
		const html = response.html();
		return (
			html.find("h1").text().trim() === "Dashboard SR" &&
			html.find("h2").text().includes("Selamat datang,") &&
			html.find("p").text().includes(`NIM: ${username}`) &&
			html.find('input[name="password"]').size() === 0 &&
			html.find('meta[http-equiv="refresh"]').size() === 0
		);
	} catch (_) {
		return false;
	} // Never print HTML, RSC payloads or identity data.
}

export default function (cfg) {
	const account = users[offset + vu.idInTest - 1];
	const headers = { "Content-Type": "application/json", Origin: cfg.web };
	if (webBypassSecret) headers["x-vercel-protection-bypass"] = webBypassSecret;
	// Explicit zero samples make failure counts/thresholds available on successful runs.
	for (const metric of [
		loginOk,
		loginLimited,
		login5xx,
		loginOther,
		dashboardOk,
		dashboard5xx,
		dashboardOther,
		journeyOk,
		journeyFailed,
		http429,
		http4xx,
		http5xx,
		networkFailures,
	])
		metric.add(0);
	const started = Date.now();
	const login = http.post(
		`${cfg.web}/api/auth/sign-in/username`,
		JSON.stringify({ username: account.username, password: account.password }),
		{
			headers,
			redirects: 0,
			timeout: "15s",
			tags: { name: "RESORA_LOGIN" },
		},
	);
	loginMs.add(login.timings.duration);
	if (login.status === 200) loginOk.add(1);
	else if (login.status === 429) loginLimited.add(1);
	else if (login.status >= 500) login5xx.add(1);
	else loginOther.add(1);
	check(login, { "login HTTP 200": (r) => r.status === 200 });
	if (login.status !== 200) {
		countHttpFailure(login.status);
		reportFailure("LOGIN", login.status);
		journeyFailed.add(1);
		journeyMs.add(Date.now() - started);
		return;
	}
	// k6 keeps a separate cookie jar for each VU; same-origin dashboard uses its login cookie.
	const dashboard = http.get(`${cfg.web}/dashboard`, {
		headers: {
			Origin: cfg.web,
			...(webBypassSecret
				? { "x-vercel-protection-bypass": webBypassSecret }
				: {}),
		},
		redirects: 0,
		timeout: "15s",
		tags: { name: "RESORA_DASHBOARD" },
	});
	const elapsed = Date.now() - started; // HTTP journey only; excludes HTML assertion/rendering time.
	dashboardMs.add(dashboard.timings.duration);
	const valid = authenticatedDashboard(dashboard, account.username);
	check(dashboard, {
		"dashboard HTTP 200 + authenticated SSR identity": () => valid,
	});
	if (valid) {
		dashboardOk.add(1);
		journeyOk.add(1);
	} else {
		if (dashboard.status >= 500) dashboard5xx.add(1);
		else dashboardOther.add(1);
		countHttpFailure(dashboard.status);
		reportFailure("DASHBOARD", dashboard.status);
		journeyFailed.add(1);
	}
	journeyMs.add(elapsed);
}
