// One authenticated NEW attendance write per synthetic VU, same challenge for the whole wave.
// Manual, isolated DEV runs only. No retries, event preparation or automatic escalation.
import { check } from "k6";
import { SharedArray } from "k6/data";
import { vu } from "k6/execution";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

function readPrivate(path) {
	try {
		return JSON.parse(open(path));
	} catch (_) {
		throw new Error("STOP: unable to read private QR/account fixture");
	}
}
const users = new SharedArray("approved QR synthetic accounts", () => {
	const data = readPrivate(__ENV.ACCOUNTS_FILE || "./accounts.local.json");
	if (!Array.isArray(data?.accounts))
		throw new Error(
			"STOP: private accounts fixture must contain an accounts array",
		);
	return data.accounts;
});
const fixture = readPrivate(__ENV.QR_FIXTURE_FILE || "./qr-fixture.local.json");
const vus = Number(__ENV.VUS || "2");
const offset = Number(__ENV.ACCOUNT_OFFSET || "0");
const transport = __ENV.QR_TRANSPORT ?? "web";
const counters = {};
for (const name of [
	"login_success",
	"login_failed",
	"checked_in",
	"already_checked_in",
	"business_failures",
	"trpc_errors",
	"protocol_errors",
	"fixture_expired",
	"journey_failed",
])
	counters[name] = new Counter(`resora_qr_${name}`);
for (const phase of ["login", "checkin"])
	for (const kind of ["429", "4xx", "5xx", "network_failures", "timeouts"])
		counters[`${phase}_${kind}`] = new Counter(`resora_qr_${phase}_${kind}`);
const loginMs = new Trend("resora_qr_login_ms", true);
const checkinMs = new Trend("resora_qr_checkin_ms", true);
const journeyMs = new Trend("resora_qr_journey_ms", true);

export const options = {
	summaryTrendStats: ["min", "p(50)", "p(95)", "max"],
	scenarios: {
		qr_checkin: {
			executor: "per-vu-iterations",
			vus,
			iterations: 1,
			maxDuration: "120s",
			gracefulStop: "0s",
		},
	},
	thresholds: {
		checks: ["rate==1"],
		resora_qr_login_success: [`count==${vus}`],
		resora_qr_checked_in: [`count==${vus}`],
		resora_qr_already_checked_in: ["count==0"],
		resora_qr_journey_failed: ["count==0"],
	},
};

export function setup() {
	if (
		__ENV.APPROVE_ISOLATED_TARGET !== "yes" ||
		__ENV.APPROVE_QR_CHECKIN_TEST !== "yes"
	)
		throw new Error(
			"STOP: independently verify isolation and obtain separate QR write-test approval before setting both approval flags to yes",
		);
	const web = __ENV.WEB_ORIGIN;
	const api = __ENV.API_ORIGIN;
	const production =
		/^https:\/\/(?:(?:www\.)?(?:resora\.)?telkomdormitory\.com|resora(?:-telu|-api)\.vercel\.app)\.?(?::\d+)?$/i;
	if (
		[web, api, __ENV.TARGET_ORIGIN].some((origin) =>
			production.test(origin || ""),
		)
	)
		throw new Error("STOP: Production origins are forbidden for QR load tests");
	if (
		web !==
			"https://resora-git-test-stress-test-vps-solc1us-projects.vercel.app" ||
		api !==
			"https://resora-api-git-test-stress-test-vps-solc1us-projects.vercel.app" ||
		__ENV.TARGET_ORIGIN !== web
	)
		throw new Error(
			"STOP: use only the approved Web/API Preview pair with TARGET_ORIGIN equal to WEB_ORIGIN",
		);
	if (!["web", "api-direct"].includes(transport))
		throw new Error("STOP: QR_TRANSPORT must be web or api-direct");
	if (transport === "api-direct" && !__ENV.VERCEL_API_BYPASS_SECRET?.trim())
		throw new Error("STOP: api-direct requires VERCEL_API_BYPASS_SECRET");
	if (
		![2, 5, 10, 25, 50].includes(vus) ||
		!Number.isInteger(offset) ||
		offset < 0 ||
		users.length < offset + vus
	)
		throw new Error(
			"STOP: VUS must be 2/5/10/25/50 with enough distinct synthetic accounts and a valid offset",
		);
	const selected = new Set();
	for (let i = offset; i < offset + vus; i++) {
		const account = users[i];
		const suffix =
			typeof account?.username === "string"
				? Number(account.username.slice(-3))
				: 0;
		if (
			!/^lt_resora_20261014_\d{3}$/.test(account?.username || "") ||
			suffix < 1 ||
			suffix > 50 ||
			typeof account.password !== "string" ||
			!account.password ||
			account.password.startsWith("REPLACE_") ||
			selected.has(account.username)
		)
			throw new Error(
				"STOP: invalid, duplicate or unapproved synthetic account",
			);
		selected.add(account.username);
	}
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
	const token = /^resora:v1:([0-9a-f-]{36}):([0-9a-f-]{36}):[0-9a-f]{64}$/.exec(
		fixture?.qrToken || "",
	);
	const location = fixture?.location;
	if (
		!uuid.test(fixture?.eventId || "") ||
		!uuid.test(fixture?.sessionId || "") ||
		!token ||
		!uuid.test(token[1]) ||
		!uuid.test(token[2]) ||
		token[1] !== fixture.sessionId ||
		fixture.preparedForVus !== vus ||
		!location ||
		!Number.isFinite(location.latitude) ||
		Math.abs(location.latitude) > 90 ||
		!Number.isFinite(location.longitude) ||
		Math.abs(location.longitude) > 180 ||
		!Number.isFinite(location.accuracyMeters) ||
		location.accuracyMeters <= 0 ||
		location.accuracyMeters > 40
	)
		throw new Error(
			"STOP: invalid QR fixture, GPS, session binding or preparedForVus",
		);
	const activated = Date.parse(fixture.activatedAt);
	const expires = Date.parse(fixture.expiresAt);
	if (
		!Number.isFinite(activated) ||
		!Number.isFinite(expires) ||
		activated > Date.now() ||
		expires <= Date.now() + 120_000
	)
		throw new Error(
			"STOP: QR fixture must be activated and have more than 120 seconds remaining",
		);
	return { web, requestOrigin: transport === "api-direct" ? api : web };
}

function recordHttp(response, phase) {
	if (response.status === 0) counters[`${phase}_network_failures`].add(1);
	else if (response.status === 429) counters[`${phase}_429`].add(1);
	else if (response.status >= 400 && response.status < 500)
		counters[`${phase}_4xx`].add(1);
	else if (response.status >= 500) counters[`${phase}_5xx`].add(1);
	// k6 request timeout / TCP dial timeout. Do not inspect or print raw error text.
	if (
		response.status === 0 &&
		(response.error_code === 1050 || response.error_code === 1211)
	)
		counters[`${phase}_timeouts`].add(1);
}

function checkinOutcome(response) {
	if (response.status === 0) return "NETWORK_ERROR";
	let body;
	try {
		body = response.json();
	} catch (_) {
		return "INVALID_RESPONSE";
	}
	const entry = Array.isArray(body) && body.length === 1 ? body[0] : null;
	if (entry?.error) {
		const code = [
			"BAD_REQUEST",
			"UNAUTHORIZED",
			"FORBIDDEN",
			"NOT_FOUND",
			"CONFLICT",
			"TOO_MANY_REQUESTS",
			"TIMEOUT",
			"INTERNAL_SERVER_ERROR",
		].includes(entry.error.data?.code)
			? entry.error.data.code
			: "UNKNOWN";
		counters.trpc_errors.add(1, { code });
		const reason = entry.error.message;
		if (
			[
				"NOT_ELIGIBLE",
				"NOT_INVITED",
				"INVALID_QR",
				"QR_EXPIRED",
				"QR_REVOKED",
				"SESSION_INACTIVE",
				"SESSION_CLOSED",
				"INVALID_LOCATION",
				"GPS_INACCURATE",
				"OUTSIDE_GEOFENCE",
			].includes(reason)
		) {
			counters.business_failures.add(1, { reason });
			return reason;
		}
		return code;
	}
	const result = entry?.result?.data;
	if (
		response.status === 200 &&
		["CHECKED_IN", "ALREADY_CHECKED_IN"].includes(result?.status) &&
		typeof result.eventName === "string" &&
		typeof result.attendanceAt === "string" &&
		Number.isFinite(Date.parse(result.attendanceAt)) &&
		["EARLY", "ON_TIME", "LATE"].includes(result.timingClass)
	)
		return result.status;
	return "INVALID_RESPONSE";
}

export default function (cfg) {
	for (const metric of Object.values(counters)) metric.add(0);
	const account = users[offset + vu.idInTest - 1];
	const headers = { "Content-Type": "application/json", Origin: cfg.web };
	const bypass =
		transport === "api-direct"
			? __ENV.VERCEL_API_BYPASS_SECRET
			: __ENV.VERCEL_WEB_BYPASS_SECRET || __ENV.VERCEL_BYPASS_SECRET;
	if (bypass) headers["x-vercel-protection-bypass"] = bypass;
	const started = Date.now();
	const login = http.post(
		`${cfg.requestOrigin}/api/auth/sign-in/username`,
		JSON.stringify({ username: account.username, password: account.password }),
		{
			headers,
			redirects: 0,
			timeout: "15s",
			tags: { name: "RESORA_QR_LOGIN" },
		},
	);
	loginMs.add(login.timings.duration);
	recordHttp(login, "login");
	// Login and check-in share the selected origin's per-VU jar; never copy cookies across hosts.
	const cookies = http
		.cookieJar()
		.cookiesForURL(`${cfg.requestOrigin}/trpc/attendance.checkIn`);
	const authenticated =
		login.status === 200 &&
		Object.keys(cookies).some((name) =>
			/^(?:__Secure-)?better-auth\.session_token$/.test(name),
		);
	check(login, {
		"QR login HTTP 200 with session cookie": () => authenticated,
	});
	if (!authenticated) {
		counters.login_failed.add(1);
		counters.journey_failed.add(1);
		journeyMs.add(Date.now() - started);
		console.warn(
			`RESORA_QR_REQUEST_FAILURE phase=LOGIN status=${login.status} outcome=LOGIN_FAILED`,
		);
		return;
	}
	counters.login_success.add(1);
	if (Date.parse(fixture.expiresAt) <= Date.now()) {
		counters.fixture_expired.add(1);
		counters.journey_failed.add(1);
		journeyMs.add(Date.now() - started);
		check(null, { "QR still valid before submission": () => false });
		console.warn(
			"RESORA_QR_REQUEST_FAILURE phase=CHECKIN status=0 outcome=FIXTURE_EXPIRED_NOT_SENT",
		);
		return;
	}
	const response = http.post(
		`${cfg.requestOrigin}/trpc/attendance.checkIn?batch=1`,
		JSON.stringify({
			0: {
				qrToken: fixture.qrToken,
				location: {
					latitude: fixture.location.latitude,
					longitude: fixture.location.longitude,
					accuracyMeters: fixture.location.accuracyMeters,
				},
			},
		}),
		{
			headers,
			redirects: 0,
			timeout: "60s",
			tags: { name: "RESORA_QR_CHECKIN" },
		},
	);
	const elapsed = Date.now() - started;
	checkinMs.add(response.timings.duration);
	recordHttp(response, "checkin");
	const outcome = checkinOutcome(response);
	check(response, {
		"QR created new CHECKED_IN attendance": () => outcome === "CHECKED_IN",
	});
	if (outcome === "CHECKED_IN") counters.checked_in.add(1);
	else {
		if (outcome === "ALREADY_CHECKED_IN") counters.already_checked_in.add(1);
		if (outcome === "INVALID_RESPONSE") counters.protocol_errors.add(1);
		counters.journey_failed.add(1);
		console.warn(
			`RESORA_QR_REQUEST_FAILURE phase=CHECKIN status=${response.status} outcome=${outcome}`,
		);
	}
	journeyMs.add(elapsed);
}
