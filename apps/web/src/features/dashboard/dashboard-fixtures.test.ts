import { expect, test } from "bun:test";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { dashboardFixtures, dashboardFixturesFor } from "./dashboard-fixtures";
import { DashboardMetricCard } from "./dashboard-metric-card";
import { DashboardMetrics } from "./dashboard-metrics";
import { DashboardPreviewProvider } from "./dashboard-preview-context";
import states from "./fixtures/states.json";

test("dashboard fixtures expose both modes and valid periods and scopes", () => {
	for (const [mode, fixture] of Object.entries(dashboardFixtures)) {
		expect(fixture.mode).toBe(mode as "personal" | "management");
		expect(fixture.metrics).toHaveLength(4);
		for (const metric of fixture.metrics) {
			expect(metric.period.label.length).toBeGreaterThan(0);
			expect(["individual", "department", "organization"]).toContain(
				metric.scope,
			);
		}
	}
});

test("zero is a ready value and distinct from empty", () => {
	const zero = dashboardFixtures.personal.metrics.find(
		(metric) => metric.id === "attendance",
	);
	const empty = dashboardFixtures.personal.metrics.find(
		(metric) => metric.id === "violations",
	);
	if (!zero || !empty)
		throw new Error("Required personal fixture metrics missing");
	expect(zero?.state).toMatchObject({ kind: "ready", value: 0 });
	expect(empty?.state.kind).toBe("empty");
	expect(
		renderToStaticMarkup(jsxRuntime.jsx(DashboardMetricCard, { metric: zero })),
	).toContain(">0<");
});

test("coming soon is shown as a module state, not an empty value", () => {
	const cleanliness = dashboardFixtures.personal.metrics.find(
		(metric) => metric.id === "cleanliness",
	);
	if (!cleanliness) throw new Error("Personal cleanliness fixture missing");
	const markup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, { metric: cleanliness }),
	);
	expect(markup).toContain("Modul kebersihan segera tersedia.");
	expect(markup).not.toContain(">0<");
});

test("state fixture covers transport and unavailable display states", () => {
	expect(states.ready_zero).toMatchObject({ kind: "ready", value: 0 });
	for (const kind of [
		"loading",
		"empty",
		"not_assessed",
		"missing_period",
		"coming_soon",
		"error",
		"forbidden",
		"stale",
	]) {
		expect(Object.values(states).some((state) => state.kind === kind)).toBe(
			true,
		);
	}
});

test("personal attendance preview is synthetic and management has no personal history", () => {
	const personalHistory = dashboardFixtures.personal.attendanceHistory;
	expect(personalHistory.length).toBeGreaterThan(0);
	expect(personalHistory.every((item) => item.id.startsWith("fixture-"))).toBe(
		true,
	);
	expect(
		personalHistory.every((item) =>
			["PRESENT", "PENDING", "ABSENT"].includes(item.presence),
		),
	).toBe(true);
	expect(dashboardFixtures.management.attendanceHistory).toHaveLength(0);
});

test("management mode is capability-gated and production KPIs fail closed", () => {
	const managementMarkup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardPreviewProvider, {
			fixtures: null,
			canManage: true,
			initialMode: "management",
			children: jsxRuntime.jsx(DashboardMetrics, {}),
		}),
	);
	expect(managementMarkup).toContain("Ringkasan Manajemen");
	expect(managementMarkup).toContain("Cakupan: seluruh departemen.");
	expect(managementMarkup).toContain(
		"Sumber ringkasan manajemen belum tersedia.",
	);
	expect(managementMarkup).toContain("Mode dashboard");

	const personalMarkup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardPreviewProvider, {
			fixtures: null,
			canManage: false,
			initialMode: "management",
			children: jsxRuntime.jsx(DashboardMetrics, {}),
		}),
	);
	expect(personalMarkup).toContain("Ringkasan");
	expect(personalMarkup).not.toContain("Ringkasan Manajemen");
	expect(personalMarkup).not.toContain("Mode dashboard");
});

test("management preview fixture is not sent to sessions without capability", async () => {
	const personalOnly = dashboardFixturesFor(false);
	const managementEnabled = dashboardFixturesFor(true);
	expect(personalOnly?.personal).toBeDefined();
	expect(personalOnly?.management).toBeUndefined();
	expect(managementEnabled?.management).toBeDefined();
});
