// Public endpoint availability only, not authenticated application capacity.
// Fixed Production target. No account fixture, credentials, POSTs or redirects.
import { check } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const vus = Number(__ENV.SMOKE_VUS || "1");
const latency = new Trend("resora_public_smoke_ms", true);
const success = new Counter("resora_public_smoke_ok");
const httpErrors = new Counter("resora_public_smoke_http_errors");
const networkFailures = new Counter("resora_public_smoke_network_failures");

export const options = {
	summaryTrendStats: ["min", "p(50)", "p(95)", "max"],
	scenarios: {
		public_smoke: {
			executor: "per-vu-iterations",
			vus,
			iterations: 1,
			maxDuration: "30s",
			gracefulStop: "0s",
		},
	},
	thresholds: {
		checks: ["rate==1"],
		resora_public_smoke_ok: [`count==${vus}`],
		resora_public_smoke_http_errors: ["count==0"],
		resora_public_smoke_network_failures: ["count==0"],
	},
};

export function setup() {
	if (__ENV.APPROVE_PRODUCTION_SMOKE !== "yes")
		throw new Error(
			"STOP: public Production smoke requires APPROVE_PRODUCTION_SMOKE=yes",
		);
	if (!Number.isInteger(vus) || vus < 1 || vus > 5)
		throw new Error("SMOKE_VUS must be 1..5, one iteration per VU");
}

export default function () {
	success.add(0);
	httpErrors.add(0);
	networkFailures.add(0);
	const response = http.get("https://resora.telkomdormitory.com/login", {
		redirects: 0,
		timeout: "15s",
		tags: { name: "RESORA_PUBLIC_LOGIN_SMOKE" },
	});
	latency.add(response.timings.duration);
	check(response, { "public /login HTTP 200": (r) => r.status === 200 });
	if (response.status === 200) success.add(1);
	else if (response.status === 0) networkFailures.add(1);
	else httpErrors.add(1); // Includes redirects; never follow them to another target.
}
