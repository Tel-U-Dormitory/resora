"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardMetric } from "./dashboard.contracts";
import { DashboardMetricCard } from "./dashboard-metric-card";
import {
	DashboardPreviewError,
	previewFailureState,
	requestDashboardMetric,
} from "./dashboard-preview-api";
import { useDashboardPreview } from "./dashboard-preview-context";

const unavailableMetrics: DashboardMetric[] = [
	{
		id: "assessment",
		title: "Penilaian",
		period: {
			label: "Periode evaluasi belum tersedia",
			startsAt: null,
			endsAt: null,
		},
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
		title: "Pelanggaran",
		period: {
			label: "Periode belum tersedia",
			startsAt: null,
			endsAt: null,
		},
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

function addAttendancePercentage(metric: DashboardMetric): DashboardMetric {
	if (metric.id !== "attendance" || metric.state.kind !== "ready_summary")
		return metric;

	const total = metric.state.values.find(
		(value) => value.label === "Total kegiatan relevan",
	)?.value;
	const present = metric.state.values.find(
		(value) => value.label === "Hadir",
	)?.value;
	const absent = metric.state.values.find(
		(value) => value.label === "Tidak hadir",
	)?.value;
	if (
		total === undefined ||
		present === undefined ||
		absent === undefined ||
		!Number.isFinite(total) ||
		!Number.isFinite(present) ||
		!Number.isFinite(absent) ||
		total <= 0 ||
		present < 0 ||
		absent < 0 ||
		present + absent !== total
	)
		return metric;

	return {
		...metric,
		state: {
			...metric.state,
			values: [
				...metric.state.values.filter(
					(value) => value.label !== "Persentase kehadiran",
				),
				{
					label: "Persentase kehadiran",
					value: (present / total) * 100,
					unit: "%",
				},
			],
		},
	};
}

export function DashboardMetrics({
	showCleanliness = true,
}: {
	showCleanliness?: boolean;
}) {
	const { fixture, previewMode, setPreviewMode, canManage, simulateRequests } =
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
	const displayMetrics = metrics
		.filter((metric) => showCleanliness || metric.id !== "cleanliness")
		.map(addAttendancePercentage);
	return (
		<section
			aria-labelledby="dashboard-kpi-title"
			className="resora-dashboard-kpis space-y-4"
		>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h2 id="dashboard-kpi-title" className="font-semibold text-lg">
					{previewMode === "management" ? "Ringkasan Manajemen" : "Ringkasan"}
				</h2>
				{canManage && (
					<label className="flex flex-wrap items-center gap-2 text-sm">
						<span>Cakupan ringkasan</span>
						<select
							id="dashboard-mode"
							className="min-h-11 max-w-full rounded-lg border border-border bg-surface px-3 text-foreground text-sm"
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
					</label>
				)}
			</div>
			{previewMode === "management" && (
				<p className="text-muted-foreground text-sm">
					Cakupan: seluruh departemen. Data mengikuti izin tiap modul sumber.
				</p>
			)}
			{fixture && (
				<p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-muted-foreground text-sm">
					<strong className="text-foreground">Preview sintetis.</strong> Bukan
					data nyata dan bukan bukti hak akses.
				</p>
			)}
			<div className="resora-dashboard-metrics">
				{displayMetrics.map((metric) =>
					simulateRequests && fixture && metric.id !== "cleanliness" ? (
						<DashboardMetricRequest key={metric.id} metric={metric} />
					) : (
						<DashboardMetricCard
							key={metric.id}
							metric={metric}
							preview={fixture !== null}
						/>
					),
				)}
			</div>
		</section>
	);
}

function DashboardMetricRequest({ metric }: { metric: DashboardMetric }) {
	const { identityKey, previewMode, scenarios } = useDashboardPreview();
	const scenario = scenarios[metric.id] ?? "ready";
	const query = useQuery({
		queryKey: [
			"dashboard-preview",
			identityKey,
			previewMode,
			metric.id,
			scenario,
		],
		queryFn: ({ signal }) => requestDashboardMetric(metric, scenario, signal),
		retry: false,
		gcTime: 0,
		staleTime: 0,
		meta: { errorHandledLocally: true },
	});
	const state = query.error
		? previewFailureState(query.error)
		: query.isPending
			? {
					kind: "loading" as const,
					message: `Memuat ${metric.title.toLowerCase()}…`,
				}
			: null;
	const displayed = state
		? { ...metric, state, export: null }
		: (query.data ?? metric);
	const denied =
		query.error instanceof DashboardPreviewError &&
		[401, 403].includes(Number(query.error.status));
	return (
		<div className="min-w-0 space-y-2">
			<DashboardMetricCard metric={displayed} preview />
			{query.error && !denied && (
				<button
					type="button"
					className="focus-ring min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					Muat ulang {metric.title.toLowerCase()}
				</button>
			)}
		</div>
	);
}
