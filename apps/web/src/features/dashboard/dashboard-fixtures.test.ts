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
	const attendance = dashboardFixtures.personal.metrics.find(
		(metric) => metric.id === "attendance",
	);
	const empty = dashboardFixtures.personal.metrics.find(
		(metric) => metric.id === "violations",
	);
	if (!attendance || !empty)
		throw new Error("Required personal fixture metrics missing");
	const zero = {
		...attendance,
		state: { kind: "ready" as const, value: 0, unit: " kegiatan", note: null },
	};
	expect(zero.state).toMatchObject({ kind: "ready", value: 0 });
	expect(empty?.state).toMatchObject({ kind: "ready", value: 0 });
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
	expect(markup).toContain("Segera hadir");
	expect(markup).not.toContain(">0<");
});

test("loading and error remain distinct KPI states", () => {
	const metric = dashboardFixtures.personal.metrics[0];
	const loadingMarkup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, {
			metric: { ...metric, state: { kind: "loading", message: "Memuat" } },
		}),
	);
	const errorMarkup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, {
			metric: { ...metric, state: { kind: "error", message: "Gagal memuat" } },
		}),
	);
	expect(loadingMarkup).toContain('role="status"');
	expect(loadingMarkup).toContain("Memuat");
	expect(errorMarkup).toContain('role="alert"');
	expect(errorMarkup).toContain("Gagal memuat");
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
	expect(managementMarkup).toContain("Data belum tersedia.");
	expect(managementMarkup).toContain("Segera hadir");
	expect(managementMarkup).toContain("Cakupan ringkasan");

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
	expect(personalMarkup).not.toContain("Cakupan ringkasan");
});

test("management preview fixture is not sent to sessions without capability", async () => {
	const personalOnly = dashboardFixturesFor(false);
	const managementEnabled = dashboardFixturesFor(true);
	expect(personalOnly?.personal).toBeDefined();
	expect(personalOnly?.management).toBeUndefined();
	expect(managementEnabled?.management).toBeDefined();
});

test("preview fixtures provide the approved KPI fields and show only approved export CTAs", () => {
	const assessment = dashboardFixtures.management.metrics.find(
		(metric) => metric.id === "assessment",
	);
	const attendance = dashboardFixtures.management.metrics.find(
		(metric) => metric.id === "attendance",
	);
	const cleanliness = dashboardFixtures.management.metrics.find(
		(metric) => metric.id === "cleanliness",
	);
	if (!assessment || !attendance || !cleanliness)
		throw new Error("Required management preview metrics missing");
	expect(assessment.state).toMatchObject({ kind: "ready_summary" });
	expect(attendance.state).toMatchObject({ kind: "ready_summary" });
	if (assessment.state.kind !== "ready_summary")
		throw new Error("Management assessment summary missing");
	if (attendance.state.kind !== "ready_summary")
		throw new Error("Management attendance summary missing");
	expect(assessment.state.values.map((item) => item.label)).toEqual([
		"Rata-rata nilai SR",
		"Kelengkapan penilaian",
		"Sudah dinilai",
		"Belum dinilai",
	]);
	expect(attendance.state.values.map((item) => item.label)).toEqual([
		"Total kegiatan relevan",
		"Hadir",
		"Tidak hadir",
	]);
	expect(
		attendance.state.values.some(
			(item) => item.label === "Persentase kehadiran",
		),
	).toBe(false);
	expect(cleanliness).toMatchObject({
		title: "Kebersihan Kamar",
		state: { kind: "coming_soon", message: "Segera hadir" },
		export: null,
	});
	const markup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, { metric: assessment, preview: true }),
	);
	expect(markup).toContain("Ekspor (simulasi)");
	expect(markup).toContain("disabled");
	const dashboardMarkup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardPreviewProvider, {
			fixtures: { management: dashboardFixtures.management },
			canManage: true,
			initialMode: "management",
			children: jsxRuntime.jsx(DashboardMetrics, {}),
		}),
	);
	expect(dashboardMarkup).toContain("Persentase kehadiran");
	expect(dashboardMarkup).toContain("92,6");
});

test("attendance percentage is omitted for zero or inconsistent counts", () => {
	const fixture = dashboardFixtures.management;
	const attendance = fixture.metrics.find(
		(metric) => metric.id === "attendance",
	);
	if (attendance?.state.kind !== "ready_summary")
		throw new Error("Management attendance fixture missing");
	for (const values of [
		attendance.state.values.map((value) =>
			value.label === "Total kegiatan relevan" ? { ...value, value: 0 } : value,
		),
		attendance.state.values.map((value) =>
			value.label === "Tidak hadir" ? { ...value, value: 59 } : value,
		),
	]) {
		const markup = renderToStaticMarkup(
			jsxRuntime.jsx(DashboardPreviewProvider, {
				fixtures: {
					management: {
						...fixture,
						metrics: fixture.metrics.map((metric) =>
							metric.id === "attendance"
								? { ...metric, state: { ...attendance.state, values } }
								: metric,
						),
					},
				},
				canManage: true,
				initialMode: "management",
				children: jsxRuntime.jsx(DashboardMetrics, {}),
			}),
		);
		expect(markup).not.toContain("Persentase kehadiran");
	}
});

test("metric cards keep scope and period explicit without exposing a fake production export", () => {
	const metric = dashboardFixtures.management.metrics[0];
	const production = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, { metric }),
	);
	expect(production).toContain("Seluruh departemen");
	expect(production).toContain(metric.period.label);
	expect(production).not.toContain("<button");
	expect(production).not.toContain("<a ");
	const preview = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, { metric, preview: true }),
	);
	expect(preview).toContain("Ekspor belum tersedia pada preview.");
	expect(preview).toContain("disabled");
});

test("non participant dashboard omits the SR cleanliness placeholder", () => {
	const markup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardPreviewProvider, {
			fixtures: null,
			canManage: true,
			initialMode: "management",
			children: jsxRuntime.jsx(DashboardMetrics, { showCleanliness: false }),
		}),
	);
	expect(markup).not.toContain("Kebersihan Kamar");
	expect(markup).toContain('data-metric="assessment"');
	expect(markup).toContain('data-state="unavailable"');
	expect(markup).not.toContain("Ekspor");
});

test("all approved metric display states retain their distinct meaning", () => {
	const metric = dashboardFixtures.personal.metrics[0];
	for (const kind of [
		"empty",
		"not_assessed",
		"missing_period",
		"coming_soon",
		"unavailable",
		"error",
		"forbidden",
	] as const) {
		const markup = renderToStaticMarkup(
			jsxRuntime.jsx(DashboardMetricCard, {
				metric: { ...metric, state: { kind, message: `State ${kind}` } },
			}),
		);
		expect(markup).toContain(`data-state="${kind}"`);
		expect(markup).toContain(`State ${kind}`);
		expect(markup).not.toContain('class="resora-metric-value"');
	}
});

test("unavailable, forbidden and missing-period cards never expose export controls", () => {
	const metric = dashboardFixtures.management.metrics[0];
	for (const kind of [
		"empty",
		"not_assessed",
		"missing_period",
		"unavailable",
		"forbidden",
		"error",
		"stale",
	] as const) {
		const markup = renderToStaticMarkup(
			jsxRuntime.jsx(DashboardMetricCard, {
				metric: { ...metric, state: { kind, message: "State" } },
				preview: true,
			}),
		);
		expect(markup).not.toContain("<button");
	}
	const cleanliness = { ...metric, id: "cleanliness" as const };
	const markup = renderToStaticMarkup(
		jsxRuntime.jsx(DashboardMetricCard, { metric: cleanliness, preview: true }),
	);
	expect(markup).toContain("Segera hadir");
	expect(markup).not.toContain("<button");
	expect(markup).not.toContain("<dl");
	expect(markup).not.toContain("<a ");
});
