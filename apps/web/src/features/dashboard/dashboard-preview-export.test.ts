import { expect, test } from "bun:test";
import { dashboardFixtures } from "./dashboard-fixtures";
import {
	type DashboardExportRequest,
	decodePreviewFile,
	requestDashboardExport,
} from "./dashboard-preview-export";

const fixture = dashboardFixtures.management;
function input(
	report: DashboardExportRequest["report"],
	format: DashboardExportRequest["format"],
): DashboardExportRequest {
	const metric = fixture.metrics.find((item) => item.id === report);
	if (!metric?.period.startsAt || !metric.period.endsAt)
		throw new Error("Missing period");
	return {
		report,
		format,
		scope: metric.scope,
		period: {
			...metric.period,
			startsAt: metric.period.startsAt,
			endsAt: metric.period.endsAt,
		},
	};
}
test("each approved report returns a labeled synthetic XLSX/PDF file with source summaries", async () => {
	for (const report of ["assessment", "attendance", "violations"] as const)
		for (const format of ["xlsx", "pdf"] as const) {
			const file = await requestDashboardExport(fixture, input(report, format));
			const bytes = decodePreviewFile(file.base64);
			expect(
				new TextDecoder().decode(bytes.slice(0, format === "pdf" ? 5 : 2)),
			).toBe(format === "pdf" ? "%PDF-" : "PK");
			expect(file.fileName).toStartWith("CONTOH-SINTETIS-");
			expect(file.fileName).toEndWith(`.${format}`);
			expect(file.rowCount).toBe(file.summary.length);
			const metric = fixture.metrics.find((item) => item.id === report);
			if (metric?.state.kind === "ready_summary")
				for (const value of metric.state.values)
					expect(file.summary).toContainEqual(value);
		}
});
test("export rejects personal mode, forged scope/period and unavailable capabilities", async () => {
	const request = input("assessment", "xlsx");
	await expect(
		requestDashboardExport(dashboardFixtures.personal, request),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		requestDashboardExport(fixture, { ...request, scope: "individual" }),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		requestDashboardExport(fixture, {
			...request,
			period: { ...request.period, startsAt: "2020-01-01" },
		}),
	).rejects.toMatchObject({ status: 403 });
	const denied = structuredClone(fixture);
	denied.metrics[0].export = null;
	await expect(requestDashboardExport(denied, request)).rejects.toMatchObject({
		status: 403,
	});
});
test("changed source data cannot silently export a different sample snapshot", async () => {
	const changed = structuredClone(fixture);
	if (changed.metrics[0].state.kind !== "ready_summary")
		throw new Error("Missing summary");
	changed.metrics[0].state.values[0].value = 12;
	await expect(
		requestDashboardExport(changed, input("assessment", "pdf")),
	).rejects.toThrow("snapshot");
});
test("cancelled and failed export requests do not return a file", async () => {
	await expect(
		requestDashboardExport(fixture, input("assessment", "pdf"), "empty"),
	).rejects.toThrow("Tidak ada data");
	await expect(
		requestDashboardExport(fixture, input("assessment", "pdf"), "403"),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		requestDashboardExport(fixture, input("assessment", "pdf"), "500"),
	).rejects.toMatchObject({ status: 500 });
	const controller = new AbortController();
	const pending = requestDashboardExport(
		fixture,
		input("assessment", "pdf"),
		"slow",
		controller.signal,
	);
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
test("production bundle omits downloadable synthetic fixture payloads", async () => {
	const result = await Bun.build({
		entrypoints: [
			new URL("./dashboard-preview-export.ts", import.meta.url).pathname,
		],
		target: "browser",
		define: { "process.env.NODE_ENV": JSON.stringify("production") },
		minify: true,
	});
	expect(result.success).toBe(true);
	expect(await result.outputs[0].text()).not.toContain("UEsDB");
});
