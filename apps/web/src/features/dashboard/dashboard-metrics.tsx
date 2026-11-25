"use client";

import type { DashboardMetric } from "./dashboard.contracts";
import { DashboardMetricCard } from "./dashboard-metric-card";
import { useDashboardPreview } from "./dashboard-preview-context";

const unavailableMetrics: DashboardMetric[] = [
	{
		id: "assessment",
		title: "Penilaian",
		period: { label: "Periode evaluasi belum tersedia", startsAt: null, endsAt: null },
		scope: "individual",
		state: { kind: "unavailable", message: "Data belum tersedia." },
		export: null,
	},
	{
		id: "attendance",
		title: "Kehadiran",
		period: {
			label: "Periode menjabat belum tersedia",
			startsAt: null,
			endsAt: null,
		},
		scope: "individual",
		state: { kind: "unavailable", message: "Data belum tersedia." },
		export: null,
	},
	{
		id: "violations",
		title: "Pelanggaran aktif",
		period: { label: "Periode menjabat belum tersedia", startsAt: null, endsAt: null },
		scope: "individual",
		state: { kind: "unavailable", message: "Data belum tersedia." },
		export: null,
	},
	{
		id: "cleanliness",
		title: "Kebersihan Kamar",
		period: { label: "Segera hadir", startsAt: null, endsAt: null },
		scope: "individual",
		state: {
			kind: "coming_soon",
			message: "Segera hadir",
		},
		export: null,
	},
];

export function DashboardMetrics() {
	const { fixture, previewMode, setPreviewMode, canManage } =
		useDashboardPreview();
	const metrics =
		fixture?.metrics ??
		(previewMode === "management"
			? unavailableMetrics.map((metric) => ({
					...metric,
					scope: "organization" as const,
					state:
						metric.id === "cleanliness"
							? metric.state
							: {
									kind: "unavailable" as const,
									message: "Data belum tersedia.",
								},
					export: null,
				}))
			: unavailableMetrics);
	return (
		<section aria-labelledby="dashboard-kpi-title" className="space-y-3">
			<div className="flex items-end justify-between gap-3">
				<h2 id="dashboard-kpi-title" className="font-semibold text-lg">
					{previewMode === "management" ? "Ringkasan Manajemen" : "Ringkasan"}
				</h2>
				{canManage && (
					<select
						aria-label={fixture ? "Mode preview dashboard" : "Mode dashboard"}
						className="min-h-10 max-w-48 rounded-lg border border-border bg-surface px-3 text-foreground text-xs"
						value={previewMode}
						onChange={(event) =>
							setPreviewMode(event.target.value as "personal" | "management")
						}
					>
						<option value="personal">Personal</option>
						<option value="management">
							{fixture ? "Manajemen (sintetis)" : "Manajemen"}
						</option>
					</select>
				)}
			</div>
			{previewMode === "management" && (
				<p className="text-muted-foreground text-xs">
					Cakupan: seluruh departemen. Data mengikuti izin tiap modul sumber.
				</p>
			)}
			{fixture && (
				<p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-muted-foreground text-xs">
					<strong className="text-foreground">Preview sintetis.</strong> Bukan
					data nyata dan bukan bukti hak akses.
				</p>
			)}
			<div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
				{metrics.map((metric) => (
					<DashboardMetricCard
						key={metric.id}
						metric={metric}
						preview={fixture !== null}
					/>
				))}
			</div>
		</section>
	);
}
