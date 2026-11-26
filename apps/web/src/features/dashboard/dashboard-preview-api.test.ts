import { expect, test } from "bun:test";
import { dashboardFixtures } from "./dashboard-fixtures";
import {
	DashboardPreviewError,
	previewFailureState,
	requestDashboardActivities,
	requestDashboardBroadcasts,
	requestDashboardMetric,
} from "./dashboard-preview-api";

const assessment = dashboardFixtures.management.metrics[0];
test("JSON-backed responses are copied without calculating assessment aggregates", async () => {
	const response = await requestDashboardMetric(assessment);
	expect(response).toEqual(assessment);
	expect(response).not.toBe(assessment);
	if (response.state.kind !== "ready_summary")
		throw new Error("Expected summary");
	response.state.values[0].value = 999;
	expect(
		assessment.state.kind === "ready_summary" &&
			assessment.state.values[0].value,
	).toBe(84.6);
});
test("independent source failures preserve successful results and deny access explicitly", async () => {
	const result = await Promise.allSettled([
		requestDashboardMetric(assessment, "403"),
		requestDashboardMetric(dashboardFixtures.management.metrics[2]),
	]);
	expect(result[0].status).toBe("rejected");
	expect(result[1].status).toBe("fulfilled");
	if (result[0].status === "rejected")
		expect(previewFailureState(result[0].reason).kind).toBe("forbidden");
});
test("transport errors never return synthetic success or unavailable", async () => {
	for (const status of [401, 403, 429, 500, 503, "timeout"] as const) {
		const error = new DashboardPreviewError(status);
		expect(previewFailureState(error).kind).toBe(
			status === 401 || status === 403 ? "forbidden" : "error",
		);
	}
	await expect(
		requestDashboardMetric(assessment, "timeout"),
	).rejects.toMatchObject({ status: "timeout" });
});
test("zero, not assessed, no period, empty and unavailable are distinct responses", async () => {
	for (const scenario of [
		"zero",
		"not_assessed",
		"missing_period",
		"empty",
		"unavailable",
		"stale",
	] as const) {
		const response = await requestDashboardMetric(assessment, scenario);
		expect(response.state.kind).toBe(
			scenario === "zero" ? "ready_summary" : scenario,
		);
		if (scenario !== "zero") expect(response.export).toBeNull();
		if (scenario === "missing_period")
			expect(response.period.startsAt).toBeNull();
	}
});
test("unmount/account change can abort slow requests without publishing data", async () => {
	const controller = new AbortController();
	const request = requestDashboardMetric(assessment, "slow", controller.signal);
	controller.abort();
	await expect(request).rejects.toMatchObject({ name: "AbortError" });
});
test("production rejects preview transport before reading JSON or running requests", () => {
	const source = new URL("./dashboard-preview-api.ts", import.meta.url)
		.pathname;
	const child = Bun.spawnSync(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`import { waitForDashboardPreview } from ${JSON.stringify(source)}; try { await waitForDashboardPreview("ready"); process.exit(1); } catch(error) { if (!String(error).includes("disabled in production")) process.exit(2); }`,
		],
		{ env: { NODE_ENV: "production" } },
	);
	expect(child.exitCode).toBe(0);
});

test("activity preview returns at most five nearest visible published events", async () => {
	const fixture = structuredClone(dashboardFixtures.personal);
	const sample = fixture.activities[0];
	fixture.activities = Array.from({ length: 7 }, (_, index) => ({
		...sample,
		id: `event-${index}`,
		startsAt: `2026-12-0${7 - index}T09:00:00+07:00`,
	}));
	fixture.activities.push(
		{ ...sample, id: "past", startsAt: "2025-01-01T09:00:00+07:00" },
		{ ...sample, id: "cancelled", status: "CANCELLED" },
		{ ...sample, id: "hidden", visible: false },
		{ ...sample, id: "closed", status: "CLOSED" },
		{ ...sample, id: "archived", status: "ARCHIVED" },
	);
	const response = await requestDashboardActivities(
		fixture,
		"ready",
		undefined,
		Date.parse("2026-11-26T00:00:00+07:00"),
	);
	expect(response.activities).toHaveLength(5);
	expect(response.activities.map((event) => event.id)).toEqual([
		"event-6",
		"event-5",
		"event-4",
		"event-3",
		"event-2",
	]);
	expect(
		(await requestDashboardActivities(fixture, "empty")).activities,
	).toEqual([]);
});
test("broadcast preview uses latest active synthetic summaries and excludes expired entries", async () => {
	const fixture = structuredClone(dashboardFixtures.personal);
	fixture.broadcasts.push({
		...fixture.broadcasts[0],
		id: "expired",
		expiresAt: "2025-01-01T00:00:00Z",
	});
	const items = await requestDashboardBroadcasts(
		fixture,
		"ready",
		undefined,
		Date.parse("2026-11-26T12:00:00+07:00"),
	);
	expect(items.map((item) => item.id)).toEqual(["fixture-broadcast-1"]);
	expect((await requestDashboardBroadcasts(fixture, "empty")).length).toBe(0);
});
