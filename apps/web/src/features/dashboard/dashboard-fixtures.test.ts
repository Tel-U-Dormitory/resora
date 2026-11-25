import { expect, test } from "bun:test";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { dashboardFixtures } from "./dashboard-fixtures";
import { DashboardMetricCard } from "./dashboard-metric-card";
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
