"use client";

import type { DashboardMetric } from "./dashboard.contracts";
import { DashboardMetricCard } from "./dashboard-metric-card";
import { useDashboardPreview } from "./dashboard-preview-context";

const unavailableMetrics: DashboardMetric[] = [
	{
		id: "assessment",
		title: "Penilaian",
		period: { label: "Periode belum tersedia", startsAt: null, endsAt: null },
		scope: "individual",
		state: { kind: "unavailable", message: "Sumber rekap belum tersedia." },
		export: null,
	},
	{
		id: "attendance",
		title: "Kehadiran",
		period: {
			label: "Rekap periode belum tersedia",
			startsAt: null,
			endsAt: null,
		},
		scope: "individual",
		state: { kind: "unavailable", message: "Sumber rekap belum tersedia." },
		export: null,
	},
	{
		id: "violations",
		title: "Pelanggaran aktif",
		period: { label: "Periode belum tersedia", startsAt: null, endsAt: null },
		scope: "individual",
		state: { kind: "unavailable", message: "Modul belum tersedia." },
		export: null,
	},
	{
		id: "cleanliness",
		title: "Kebersihan",
		period: { label: "Periode berjalan", startsAt: null, endsAt: null },
		scope: "individual",
		state: {
			kind: "coming_soon",
			message: "Modul kebersihan segera tersedia.",
		},
		export: null,
	},
];

export function DashboardMetrics() {
	const { fixture, previewMode, setPreviewMode } = useDashboardPreview();
	const metrics = fixture?.metrics ?? unavailableMetrics;
	return (
		<section aria-labelledby="dashboard-kpi-title" className="space-y-3">
			<div className="flex items-end justify-between gap-3">
				<h2 id="dashboard-kpi-title" className="font-semibold text-lg">
					Ringkasan
				</h2>
				{fixture && (
					<select
						aria-label="Mode preview dashboard"
						className="min-h-10 max-w-48 rounded-lg border border-border bg-surface px-3 text-foreground text-xs"
						value={previewMode}
						onChange={(event) =>
							setPreviewMode(event.target.value as "personal" | "management")
						}
					>
						<option value="personal">Personal</option>
						<option value="management">Manajemen (sintetis)</option>
					</select>
				)}
			</div>
			{fixture && (
				<p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-muted-foreground text-xs">
					<strong className="text-foreground">Preview sintetis.</strong> Bukan
					data nyata dan bukan bukti hak akses.
				</p>
			)}
			<div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
				{metrics.map((metric) => (
					<DashboardMetricCard key={metric.id} metric={metric} />
				))}
			</div>
		</section>
	);
}
