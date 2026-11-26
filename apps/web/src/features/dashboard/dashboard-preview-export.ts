import { z } from "zod";
import type {
	DashboardFixture,
	DashboardScenario,
} from "./dashboard.contracts";
import {
	DashboardPreviewError,
	waitForDashboardPreview,
} from "./dashboard-preview-api";

const requestSchema = z
	.object({
		report: z.enum(["assessment", "attendance", "violations"]),
		format: z.enum(["xlsx", "pdf"]),
		scope: z.enum(["individual", "department", "organization"]),
		period: z
			.object({ label: z.string(), startsAt: z.string(), endsAt: z.string() })
			.strict(),
	})
	.strict();
export type DashboardExportRequest = z.infer<typeof requestSchema>;
const fileSchema = requestSchema
	.extend({
		mode: z.literal("management"),
		fileName: z
			.string()
			.regex(/^CONTOH-SINTETIS-[a-z]+-2026-2027\.(xlsx|pdf)$/),
		mimeType: z.enum([
			"application/pdf",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		]),
		rowCount: z.number().int().nonnegative(),
		summary: z.array(
			z.object({
				label: z.string(),
				value: z.number(),
				unit: z.string().nullable(),
			}),
		),
		base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
	})
	.strict();

export async function requestDashboardExport(
	fixture: DashboardFixture,
	input: DashboardExportRequest,
	scenario: DashboardScenario = "ready",
	signal?: AbortSignal,
) {
	await waitForDashboardPreview(scenario, signal);
	if (scenario === "empty")
		throw new Error("Tidak ada data untuk contoh laporan ini.");
	const request = requestSchema.parse(input);
	const metric = fixture.metrics.find((item) => item.id === request.report);
	if (
		fixture.mode !== "management" ||
		!metric?.export ||
		!["ready", "ready_summary"].includes(metric.state.kind) ||
		!metric.export.formats.includes(request.format) ||
		metric.scope !== request.scope ||
		metric.period.startsAt !== request.period.startsAt ||
		metric.period.endsAt !== request.period.endsAt ||
		metric.period.label !== request.period.label
	)
		throw new DashboardPreviewError(403);
	if (
		process.env.NODE_ENV === "development" ||
		process.env.NODE_ENV === "test"
	) {
		const { default: raw } = await import("./fixtures/exports.json");
		const files = z.array(fileSchema).parse(raw);
		const file = files.find(
			(item) =>
				item.report === request.report &&
				item.format === request.format &&
				item.scope === request.scope &&
				item.period.startsAt === request.period.startsAt &&
				item.period.endsAt === request.period.endsAt &&
				item.period.label === request.period.label,
		);
		if (!file)
			throw new Error("Contoh laporan belum tersedia untuk pilihan ini.");
		const expectedMime =
			request.format === "pdf"
				? "application/pdf"
				: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		if (
			file.mimeType !== expectedMime ||
			!file.fileName.endsWith(`.${request.format}`)
		)
			throw new Error("Format contoh laporan tidak valid.");
		const values =
			metric.state.kind === "ready_summary" ? metric.state.values : [];
		if (
			file.rowCount !== file.summary.length ||
			values.some(
				(value) =>
					!file.summary.some(
						(row) =>
							row.label === value.label &&
							row.value === value.value &&
							row.unit === value.unit,
					),
			)
		)
			throw new Error("Contoh laporan tidak cocok dengan snapshot sumber.");
		return structuredClone(file);
	}
	throw new Error("Dashboard preview is disabled in production");
}

export function decodePreviewFile(base64: string) {
	return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
