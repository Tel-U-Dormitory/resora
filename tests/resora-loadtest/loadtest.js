// RESORA controlled authentication load test (Grafana k6).
// Use ONLY against an isolated, approved local/Preview environment.
// One synthetic account and one login + identity.session check per virtual user.

import { check } from "k6";
import { SharedArray } from "k6/data";
import { vu } from "k6/execution";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const users = new SharedArray("approved synthetic accounts", () => {
	const raw = JSON.parse(open(__ENV.ACCOUNTS_FILE || "./accounts.local.json"));
	if (!Array.isArray(raw.accounts))
		throw new Error('Expected {"accounts": [...]} in accounts file');
	return raw.accounts;
});

const vus = Number(__ENV.VUS || "2");
const offset = Number(__ENV.ACCOUNT_OFFSET || "0");
const loginOk = new Counter("resora_login_200");
const loginLimited = new Counter("resora_login_429");
const login5xx = new Counter("resora_login_5xx");
const loginOther = new Counter("resora_login_other");
const sessionOk = new Counter("resora_session_valid");
const session5xx = new Counter("resora_session_5xx");
const sessionOther = new Counter("resora_session_other");
const loginMs = new Trend("resora_login_ms", true);
const sessionMs = new Trend("resora_session_ms", true);

export const options = {
	scenarios: {
		auth_journey: {
			executor: "per-vu-iterations",
			vus,
			iterations: 1,
			maxDuration: "90s",
			gracefulStop: "0s",
		},
	},
	// These stop further work after repeated 5xx; a simultaneous wave may already be in flight.
	thresholds: {
		resora_login_5xx: [
			{ threshold: "count<3", abortOnFail: true, delayAbortEval: "5s" },
		],
		resora_session_5xx: [
			{ threshold: "count<3", abortOnFail: true, delayAbortEval: "5s" },
		],
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
	if (!Number.isInteger(vus) || vus < 1 || vus > 50)
		throw new Error("VUS must be 1..50");
	if (!Number.isInteger(offset) || offset < 0)
		throw new Error("ACCOUNT_OFFSET must be >= 0");
	if (users.length < offset + vus)
		throw new Error(
			"Not enough distinct synthetic accounts for requested VUS/offset",
		);
	for (let i = offset; i < offset + vus; i++) {
		if (
			typeof users[i].username !== "string" ||
			!users[i].username ||
			typeof users[i].password !== "string" ||
			!users[i].password
		) {
			throw new Error(`Invalid account fixture at index ${i}`);
		}
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
								: phase === "SESSION" && httpStatus === 200
									? "INVALID_SESSION"
									: "OTHER";
	console.warn(
		`RESORA_REQUEST_FAILURE phase=${phase} status=${httpStatus} classification=${classification}`,
	);
}

export default function (cfg) {
	const account = users[offset + vu.idInTest - 1];
	const headers = { "Content-Type": "application/json", Origin: cfg.web };
	// Optional, for a Vercel-protected Preview target. Never log or check in the secret.
	if (__ENV.VERCEL_BYPASS_SECRET) {
		headers["x-vercel-protection-bypass"] = __ENV.VERCEL_BYPASS_SECRET;
	}
	const login = http.post(
		`${cfg.target}/api/auth/sign-in/username`,
		JSON.stringify({ username: account.username, password: account.password }),
		{ headers, redirects: 0, timeout: "15s", tags: { name: "RESORA_LOGIN" } },
	);
	loginMs.add(login.timings.duration);
	if (login.status === 200) loginOk.add(1);
	else if (login.status === 429) loginLimited.add(1);
	else if (login.status >= 500) login5xx.add(1);
	else loginOther.add(1);
	check(login, { "login HTTP 200": (r) => r.status === 200 });
	if (login.status !== 200) {
		reportFailure("LOGIN", login.status);
		return; // No retries, no login loop.
	}

	// k6 keeps a separate cookie jar for each VU; the session request uses the login cookie.
	const session = http.get(`${cfg.target}/trpc/identity.session`, {
		headers: {
			Origin: cfg.web,
			...(headers["x-vercel-protection-bypass"]
				? {
						"x-vercel-protection-bypass": headers["x-vercel-protection-bypass"],
					}
				: {}),
		},
		timeout: "15s",
		tags: { name: "RESORA_IDENTITY_SESSION" },
	});
	sessionMs.add(session.timings.duration);
	let valid = false;
	if (session.status === 200) {
		try {
			const payload = session.json();
			valid = Boolean(payload?.result?.data);
		} catch (_) {
			/* malformed response is counted, never printed */
		}
	}
	if (valid) sessionOk.add(1);
	else if (session.status >= 500) session5xx.add(1);
	else sessionOther.add(1);
	check(session, { "session HTTP 200 + authenticated": () => valid });
	if (!valid) reportFailure("SESSION", session.status);
}
