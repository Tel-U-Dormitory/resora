"use client";

import { Card, CardContent } from "@resora/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ArrowRight,
	ClipboardCheck,
	Download,
	House,
	ShieldAlert,
	UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardMetric, DashboardMode } from "./dashboard.contracts";
import { DashboardExportDialog } from "./dashboard-export-dialog";
import {
	type DashboardDetailHref,
	DashboardMetricCard,
} from "./dashboard-metric-card";
import {
	DashboardPreviewError,
	previewFailureState,
	requestDashboardMetric,
} from "./dashboard-preview-api";
import { useDashboardPreview } from "./dashboard-preview-context";

const numberFormat = new Intl.NumberFormat("id-ID", {
	maximumFractionDigits: 1,
});

const icons = {
	assessment: ClipboardCheck,
	attendance: UserCheck,
	violations: ShieldAlert,
	cleanliness: House,
};

const scopes = {
	individual: "Pribadi",
	department: "Departemen",
	organization: "Seluruh departemen",
};

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

function metricDetailHref(
	metricId: DashboardMetric["id"],
	previewMode: DashboardMode,
	canManage: boolean,
	canAccessPenilaian = false,
): DashboardDetailHref | undefined {
	if (metricId === "assessment") {
		return previewMode === "management" && (canManage || canAccessPenilaian)
			? "/penilaian"
			: undefined;
	}
	if (metricId === "attendance") {
		return previewMode === "management" && canManage
			? "/penilaian?tab=points"
			: "/attendance/history";
	}
	return undefined;
}

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
	liveAssessmentMetric,
	liveAttendanceMetric,
	canAccessPenilaian = false,
	onDownloadPersonalAssessmentCsv,
	personalCsvDownloading = false,
	personalCsvError = null,
}: {
	showCleanliness?: boolean;
	liveAssessmentMetric?: DashboardMetric;
	liveAttendanceMetric?: DashboardMetric;
	canAccessPenilaian?: boolean;
	onDownloadPersonalAssessmentCsv?: (() => Promise<void> | void) | null;
	personalCsvDownloading?: boolean;
	personalCsvError?: string | null;
}) {
	const { fixture, previewMode, setPreviewMode, canManage, simulateRequests } =
		useDashboardPreview();
	const [selectedMetricId, setSelectedMetricId] = useState<
		DashboardMetric["id"] | null
	>(null);

	const openMetricDetail = useCallback((metricId: DashboardMetric["id"]) => {
		if (metricId === "cleanliness") return;
		setSelectedMetricId(metricId);
		if (typeof window !== "undefined") {
			const url = new URL(window.location.href);
			url.searchParams.set("detail", metricId);
			const nextHref = `${url.pathname}${url.search}${url.hash}`;
			if (window.history.state?.resoraMetricDetail) {
				window.history.replaceState(
					{ ...window.history.state, resoraMetricDetail: metricId },
					"",
					nextHref,
				);
			} else {
				window.history.pushState(
					{ ...window.history.state, resoraMetricDetail: metricId },
					"",
					nextHref,
				);
			}
			window.dispatchEvent(
				new CustomEvent("resora:metric-detail", { detail: metricId }),
			);
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, []);

	const closeMetricDetail = useCallback(() => {
		setSelectedMetricId(null);
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("resora:metric-detail", { detail: null }),
			);
			if (window.history.state?.resoraMetricDetail) {
				window.history.back();
				return;
			}
			const url = new URL(window.location.href);
			if (url.searchParams.has("detail")) {
				url.searchParams.delete("detail");
				window.history.replaceState(
					window.history.state,
					"",
					`${url.pathname}${url.search}${url.hash}`,
				);
			}
		}
	}, []);

	useEffect(() => {
		const validIds = new Set<DashboardMetric["id"]>([
			"assessment",
			"attendance",
			"violations",
		]);
		const param = new URLSearchParams(window.location.search).get("detail");
		if (param && validIds.has(param as DashboardMetric["id"])) {
			setSelectedMetricId(param as DashboardMetric["id"]);
		}
		const onPopState = () => {
			const stateMetric = window.history.state?.resoraMetricDetail as
				| DashboardMetric["id"]
				| undefined;
			const queryMetric = new URLSearchParams(window.location.search).get(
				"detail",
			);
			if (stateMetric && validIds.has(stateMetric)) {
				setSelectedMetricId(stateMetric);
			} else if (
				queryMetric &&
				validIds.has(queryMetric as DashboardMetric["id"])
			) {
				setSelectedMetricId(queryMetric as DashboardMetric["id"]);
			} else {
				setSelectedMetricId(null);
			}
		};
		const onBreadcrumbClose = () => {
			closeMetricDetail();
		};
		window.addEventListener("popstate", onPopState);
		window.addEventListener("resora:metric-detail-close", onBreadcrumbClose);
		return () => {
			window.removeEventListener("popstate", onPopState);
			window.removeEventListener(
				"resora:metric-detail-close",
				onBreadcrumbClose,
			);
		};
	}, [closeMetricDetail]);

	const metrics =
		fixture?.metrics ??
		(previewMode === "management"
			? unavailableMetrics.map((metric) =>
					metric.id === "assessment" && liveAssessmentMetric
						? liveAssessmentMetric
						: {
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
							},
				)
			: unavailableMetrics.map((metric) => {
					if (metric.id === "assessment" && liveAssessmentMetric) {
						return liveAssessmentMetric;
					}
					if (metric.id === "attendance" && liveAttendanceMetric) {
						return liveAttendanceMetric;
					}
					return metric;
				}));
	const displayMetrics = metrics
		.filter((metric) => showCleanliness || metric.id !== "cleanliness")
		.map(addAttendancePercentage);

	const activeMetric = selectedMetricId
		? (displayMetrics.find((metric) => metric.id === selectedMetricId) ?? null)
		: null;

	return (
		<section
			aria-labelledby={activeMetric ? undefined : "dashboard-kpi-title"}
			aria-label={
				activeMetric ? `Detail dashboard ${activeMetric.title}` : undefined
			}
			className="resora-dashboard-kpis space-y-3 sm:space-y-4"
		>
			{activeMetric ? (
				<DashboardMetricDetailView
					metric={activeMetric}
					allMetrics={displayMetrics}
					canAccessPenilaian={canAccessPenilaian}
					onDownloadPersonalAssessmentCsv={onDownloadPersonalAssessmentCsv}
					personalCsvDownloading={personalCsvDownloading}
					personalCsvError={personalCsvError}
					onSelectMetric={openMetricDetail}
					onBack={closeMetricDetail}
				/>
			) : (
				<>
					<div className="flex flex-wrap items-center justify-between gap-2.5">
						<h2
							id="dashboard-kpi-title"
							className="hidden font-bold text-base sm:text-lg min-[1200px]:block"
						>
							{previewMode === "management"
								? "Ringkasan Manajemen"
								: "Ringkasan"}
						</h2>
						{canManage && (
							<Tabs
								value={previewMode}
								onValueChange={(value) =>
									setPreviewMode(value as DashboardMode)
								}
								className="w-full min-[1200px]:w-auto"
							>
								<span className="sr-only">Cakupan ringkasan</span>
								<TabsList
									aria-label="Cakupan ringkasan"
									className="grid w-full grid-cols-2 min-[1200px]:inline-flex min-[1200px]:w-auto"
								>
									<TabsTrigger
										value="personal"
										className="w-full min-[1200px]:w-auto"
									>
										Personal
									</TabsTrigger>
									<TabsTrigger
										value="management"
										className="w-full min-[1200px]:w-auto"
									>
										Manajemen
									</TabsTrigger>
								</TabsList>
							</Tabs>
						)}
					</div>
					{previewMode === "management" && (
						<p className="sr-only">
							Cakupan: seluruh departemen. Data mengikuti izin tiap modul
							sumber.
						</p>
					)}
					{fixture && (
						<p className="w-fit max-w-full truncate rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-muted-foreground text-xs">
							<strong className="text-foreground">Preview sintetis</strong> ·
							Bukan data nyata
						</p>
					)}
					<div className="resora-metrics-surface">
						<div className="resora-dashboard-metrics">
							{displayMetrics.map((metric) =>
								simulateRequests && fixture && metric.id !== "cleanliness" ? (
									<DashboardMetricRequest
										key={metric.id}
										metric={metric}
										onSelect={() => openMetricDetail(metric.id)}
									/>
								) : (
									<DashboardMetricCard
										key={metric.id}
										metric={metric}
										preview={fixture !== null}
										onSelect={
											metric.id === "cleanliness"
												? undefined
												: () => openMetricDetail(metric.id)
										}
									/>
								),
							)}
						</div>
					</div>
				</>
			)}
		</section>
	);
}

function DashboardMetricDetailView({
	metric,
	allMetrics,
	canAccessPenilaian = false,
	onDownloadPersonalAssessmentCsv,
	personalCsvDownloading = false,
	personalCsvError = null,
	onSelectMetric,
	onBack,
}: {
	metric: DashboardMetric;
	allMetrics: DashboardMetric[];
	canAccessPenilaian?: boolean;
	onDownloadPersonalAssessmentCsv?: (() => Promise<void> | void) | null;
	personalCsvDownloading?: boolean;
	personalCsvError?: string | null;
	onSelectMetric: (metricId: DashboardMetric["id"]) => void;
	onBack: () => void;
}) {
	const {
		fixture,
		previewMode,
		canManage,
		scenarios,
		identityKey,
		simulateRequests,
	} = useDashboardPreview();
	const [chartView, setChartView] = useState<"chart" | "table">("chart");
	const [exportOpen, setExportOpen] = useState(false);

	const scenario = scenarios[metric.id] ?? "ready";
	const liveQuery = useQuery({
		queryKey: [
			"dashboard-preview",
			identityKey,
			previewMode,
			metric.id,
			scenario,
		],
		queryFn: ({ signal }) => requestDashboardMetric(metric, scenario, signal),
		enabled: Boolean(
			simulateRequests && fixture && metric.id !== "cleanliness",
		),
		retry: false,
		gcTime: 0,
		staleTime: 0,
		meta: { errorHandledLocally: true },
	});

	const resolvedState =
		simulateRequests && fixture && metric.id !== "cleanliness"
			? liveQuery.error
				? previewFailureState(liveQuery.error)
				: liveQuery.isPending
					? {
							kind: "loading" as const,
							message: `Memuat detail ${metric.title.toLowerCase()}…`,
						}
					: null
			: null;

	const displayedMetric = resolvedState
		? { ...metric, state: resolvedState, export: null }
		: (liveQuery.data ?? metric);

	const state =
		displayedMetric.id === "cleanliness"
			? { kind: "coming_soon" as const, message: "Segera hadir" }
			: displayedMetric.state;

	const Icon = icons[displayedMetric.id];
	const moduleHref = metricDetailHref(
		displayedMetric.id,
		previewMode,
		canManage,
		canAccessPenilaian,
	);
	const canExport = Boolean(
		canManage &&
			previewMode === "management" &&
			fixture &&
			displayedMetric.export &&
			(state.kind === "ready" || state.kind === "ready_summary"),
	);
	const canDownloadPersonalCsv = Boolean(
		displayedMetric.id === "assessment" &&
			previewMode === "personal" &&
			!fixture &&
			onDownloadPersonalAssessmentCsv &&
			(state.kind === "ready" || state.kind === "ready_summary"),
	);

	const breakdownItems =
		state.kind === "ready_summary"
			? state.values
			: state.kind === "ready"
				? [
						{
							label: displayedMetric.title,
							value: state.value,
							unit: state.unit,
						},
					]
				: [];

	const assessmentAverage =
		displayedMetric.id === "assessment"
			? breakdownItems.find((item) => item.label === "Rata-rata nilai SR")
			: undefined;
	const assessedCount =
		displayedMetric.id === "assessment"
			? (breakdownItems.find((item) => item.label === "Sudah dinilai")?.value ??
				0)
			: 0;
	const unassessedCount =
		displayedMetric.id === "assessment"
			? (breakdownItems.find((item) => item.label === "Belum dinilai")?.value ??
				0)
			: 0;
	const totalAssessedPool = assessedCount + unassessedCount;
	const assessedPct =
		totalAssessedPool > 0
			? Math.round((assessedCount / totalAssessedPool) * 1000) / 10
			: 0;
	const unassessedPct =
		totalAssessedPool > 0
			? Math.max(0, Math.round((100 - assessedPct) * 10) / 10)
			: 0;

	const presentCount =
		displayedMetric.id === "attendance"
			? (breakdownItems.find((item) => item.label === "Hadir")?.value ?? 0)
			: 0;
	const absentCount =
		displayedMetric.id === "attendance"
			? (breakdownItems.find((item) => item.label === "Tidak hadir")?.value ??
				0)
			: 0;
	const totalAttendancePool = presentCount + absentCount;
	const presentPct =
		totalAttendancePool > 0
			? Math.round((presentCount / totalAttendancePool) * 1000) / 10
			: 0;
	const absentPct =
		totalAttendancePool > 0
			? Math.max(0, Math.round((100 - presentPct) * 10) / 10)
			: 0;

	const tableRows = breakdownItems.map((item) => {
		const display = `${numberFormat.format(item.value)}${item.unit ? ` ${item.unit.trim()}` : ""}`;
		let context = scopes[displayedMetric.scope];
		if (item.unit === "/100") {
			context = `${numberFormat.format(item.value)}% dari skala 100`;
		} else if (item.unit === "%") {
			context = "Proporsi capaian periode";
		} else if (
			displayedMetric.id === "assessment" &&
			totalAssessedPool > 0 &&
			(item.label === "Sudah dinilai" || item.label === "Belum dinilai")
		) {
			const pct = item.label === "Sudah dinilai" ? assessedPct : unassessedPct;
			context = `${numberFormat.format(pct)}% (${numberFormat.format(item.value)} dari ${numberFormat.format(totalAssessedPool)} SR)`;
		} else if (
			displayedMetric.id === "attendance" &&
			totalAttendancePool > 0 &&
			(item.label === "Hadir" || item.label === "Tidak hadir")
		) {
			const pct = item.label === "Hadir" ? presentPct : absentPct;
			context = `${numberFormat.format(pct)}% (${numberFormat.format(item.value)} dari ${numberFormat.format(totalAttendancePool)} kegiatan)`;
		} else if (item.label === "Total kegiatan relevan") {
			context = "100% kegiatan relevan";
		}
		return {
			label: item.label,
			display,
			context,
		};
	});

	return (
		<div data-testid="dashboard-metric-detail" className="space-y-4">
			{/* Native Push-Screen App Bar on Mobile (< 1200px) */}
			<div className="-mx-4 -mt-5 flex items-center justify-between gap-2.5 border-border border-b bg-surface px-4 py-3 min-[1200px]:hidden">
				<button
					type="button"
					onClick={onBack}
					aria-label="Kembali ke ringkasan"
					className="focus-ring inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-subtle text-foreground hover:bg-muted"
				>
					<ArrowLeft size={18} aria-hidden="true" />
					<span className="sr-only">Kembali ke ringkasan</span>
				</button>
				<div className="min-w-0 flex-1">
					<h1 className="truncate font-bold text-base text-foreground leading-tight">
						{displayedMetric.title}
					</h1>
					<p className="truncate text-muted-foreground text-xs">
						{scopes[displayedMetric.scope]} · {displayedMetric.period.label}
					</p>
				</div>
				<ModeToggle allowSystem={false} />
			</div>

			{/* Desktop Header + Cross-Platform Module Switcher Tabs */}
			<div className="flex flex-col gap-3 min-[1200px]:flex-row min-[1200px]:items-center min-[1200px]:justify-between">
				<div className="hidden min-w-0 items-center gap-3.5 min-[1200px]:flex">
					<span className="resora-metric-icon" data-tone={displayedMetric.id}>
						<Icon size={20} aria-hidden="true" />
					</span>
					<div className="min-w-0 space-y-0.5">
						<p className="truncate font-semibold text-muted-foreground text-xs">
							Detail Dashboard · {scopes[displayedMetric.scope]} ·{" "}
							{displayedMetric.period.label}
						</p>
						<h1 className="truncate font-bold text-2xl text-foreground tracking-tight">
							{displayedMetric.title}
						</h1>
					</div>
				</div>

				<Tabs
					value={metric.id}
					onValueChange={(value) => {
						const target = allMetrics.find((item) => item.id === value);
						const isComingSoon =
							!target ||
							target.id === "cleanliness" ||
							target.state.kind === "coming_soon";
						if (!isComingSoon) onSelectMetric(target.id);
					}}
					className="relative min-w-0"
				>
					<TabsList aria-label="Pilih modul detail dashboard" className="pr-2">
						{allMetrics.map((item) => {
							const isComingSoon =
								item.id === "cleanliness" || item.state.kind === "coming_soon";
							return (
								<TabsTrigger
									key={item.id}
									value={item.id}
									disabled={isComingSoon}
									className="snap-start text-xs"
								>
									<span>{item.title}</span>
									{isComingSoon && (
										<span className="rounded bg-surface px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
											Segera hadir
										</span>
									)}
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>
			</div>

			{/* Secondary Action Row (Export simulation / Personal CSV / Module link when genuine route exists) */}
			{(canExport || canDownloadPersonalCsv || moduleHref) && (
				<div className="space-y-2">
					<div
						className={
							(canExport || canDownloadPersonalCsv) && moduleHref
								? "grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center"
								: "flex flex-wrap items-center gap-2.5"
						}
					>
						{canExport && (
							<button
								type="button"
								onClick={() => setExportOpen(true)}
								className="focus-ring inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border-control bg-surface px-3.5 font-semibold text-foreground text-xs hover:bg-surface-subtle"
							>
								<Download size={14} aria-hidden="true" />
								<span>Ekspor contoh</span>
							</button>
						)}
						{canDownloadPersonalCsv && (
							<button
								type="button"
								disabled={personalCsvDownloading}
								onClick={() => void onDownloadPersonalAssessmentCsv?.()}
								className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border-control bg-surface px-3.5 font-semibold text-foreground text-xs hover:bg-surface-subtle disabled:opacity-60"
							>
								<Download size={14} aria-hidden="true" />
								<span>
									{personalCsvDownloading
										? "Mengunduh CSV…"
										: "Unduh Rekap Pribadi (CSV)"}
								</span>
							</button>
						)}
						{moduleHref && (
							<Link
								href={moduleHref}
								className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 font-semibold text-foreground text-xs hover:bg-surface-subtle"
							>
								<span>Buka halaman modul</span>
								<ArrowRight size={14} aria-hidden="true" />
							</Link>
						)}
					</div>
					{personalCsvError && (
						<p role="alert" className="text-danger text-xs">
							{personalCsvError}
						</p>
					)}
				</div>
			)}

			{/* Flat Top-Level KPI Breakdown Cards (No nested Card-in-Card) */}
			{breakdownItems.length > 0 ? (
				<div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
					{breakdownItems.map((item) => (
						<div
							key={item.label}
							className="flex min-w-0 flex-col justify-between gap-1.5 rounded-2xl border border-border bg-surface p-3.5 sm:p-4"
						>
							<p className="line-clamp-2 font-medium text-muted-foreground text-xs leading-snug">
								{item.label}
							</p>
							<p className="font-bold text-foreground text-xl tabular-nums sm:text-2xl">
								{numberFormat.format(item.value)}
								{item.unit && (
									<span className="ml-1 font-semibold text-muted-foreground text-xs">
										{item.unit}
									</span>
								)}
							</p>
						</div>
					))}
				</div>
			) : (
				<div
					role={
						state.kind === "forbidden" || state.kind === "error"
							? "alert"
							: "status"
					}
					className="rounded-2xl border border-border bg-surface p-4 text-muted-foreground text-sm"
				>
					{"message" in state ? state.message : "Data belum tersedia."}
				</div>
			)}

			{/* Single-Layer Visualization Card with Accurate Scale & Composition Logic */}
			{breakdownItems.length > 0 && (
				<Card className="resora-panel py-0">
					<CardContent className="space-y-4 p-4 sm:p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h2 className="font-bold text-foreground text-sm sm:text-base">
									Distribusi {displayedMetric.title}
								</h2>
								<p className="text-muted-foreground text-xs">
									{displayedMetric.id === "assessment"
										? assessmentAverage?.unit === "/100"
											? "Skor rata-rata (skala 0–100) dan komposisi kelengkapan SR"
											: "Skor rata-rata nilai berbobot dan komposisi kelengkapan SR"
										: displayedMetric.id === "attendance"
											? "Proporsi kehadiran terhadap total kegiatan relevan"
											: `Ringkasan tercatat (${scopes[displayedMetric.scope].toLowerCase()})`}
								</p>
							</div>
							<Tabs
								value={chartView}
								onValueChange={(value) =>
									setChartView(value as "chart" | "table")
								}
							>
								<TabsList
									aria-label={`Mode tampilan detail ${displayedMetric.title}`}
								>
									<TabsTrigger value="chart" className="text-xs">
										Grafik
									</TabsTrigger>
									<TabsTrigger value="table" className="text-xs">
										Tabel
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>

						{chartView === "chart" ? (
							<div className="space-y-4">
								{displayedMetric.id === "assessment" && (
									<>
										{assessmentAverage && (
											<div className="space-y-2 rounded-xl border border-border bg-surface-subtle/60 p-3.5">
												<div className="flex items-baseline justify-between gap-2">
													<span className="font-semibold text-foreground text-xs sm:text-sm">
														Skor Rata-rata Nilai SR
													</span>
													<span className="font-bold text-base text-foreground tabular-nums">
														{numberFormat.format(assessmentAverage.value)}
														{assessmentAverage.unit === "/100" && (
															<span className="ml-0.5 font-medium text-muted-foreground text-xs">
																/100
															</span>
														)}
													</span>
												</div>
												{assessmentAverage.unit === "/100" && (
													<>
														<div className="h-3.5 overflow-hidden rounded-full border border-border-control/40 bg-surface">
															<div
																className="h-full rounded-full bg-primary transition-[width] duration-300"
																style={{
																	width: `${Math.min(100, Math.max(0, assessmentAverage.value))}%`,
																	borderRight: "2px solid #333333",
																}}
															/>
														</div>
														<div className="flex justify-between font-medium text-[11px] text-muted-foreground tabular-nums">
															<span>0</span>
															<span>50</span>
															<span>100</span>
														</div>
													</>
												)}
											</div>
										)}

										{totalAssessedPool > 0 && (
											<div className="space-y-3 rounded-xl border border-border bg-surface-subtle/60 p-3.5">
												<div className="flex items-baseline justify-between gap-2">
													<span className="font-semibold text-foreground text-xs sm:text-sm">
														Komposisi Kelengkapan ({totalAssessedPool} SR)
													</span>
													<span className="font-bold text-foreground text-xs tabular-nums">
														{numberFormat.format(assessedPct)}% selesai
													</span>
												</div>
												<div className="flex h-4 overflow-hidden rounded-full border border-border-control/40 bg-surface">
													<div
														className="h-full transition-[width] duration-300"
														style={{
															width: `${assessedPct}%`,
															background: "#5b4fe9",
														}}
														title={`Sudah dinilai: ${assessedCount} SR (${numberFormat.format(assessedPct)}%)`}
													/>
													<div
														className="h-full transition-[width] duration-300"
														style={{
															width: `${unassessedPct}%`,
															background: "#d97706",
														}}
														title={`Belum dinilai: ${unassessedCount} SR (${numberFormat.format(unassessedPct)}%)`}
													/>
												</div>
												<div className="grid grid-cols-2 gap-2.5 text-xs">
													<div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
														<span
															className="size-3 shrink-0 rounded-sm"
															style={{ background: "#5b4fe9" }}
															aria-hidden="true"
														/>
														<div className="min-w-0">
															<p className="font-medium text-muted-foreground">
																Sudah dinilai
															</p>
															<p className="font-bold text-foreground tabular-nums">
																{numberFormat.format(assessedCount)} SR ·{" "}
																{numberFormat.format(assessedPct)}%
															</p>
														</div>
													</div>
													<div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
														<span
															className="size-3 shrink-0 rounded-sm"
															style={{ background: "#d97706" }}
															aria-hidden="true"
														/>
														<div className="min-w-0">
															<p className="font-medium text-muted-foreground">
																Belum dinilai
															</p>
															<p className="font-bold text-foreground tabular-nums">
																{numberFormat.format(unassessedCount)} SR ·{" "}
																{numberFormat.format(unassessedPct)}%
															</p>
														</div>
													</div>
												</div>
											</div>
										)}
										{!assessmentAverage &&
											totalAssessedPool === 0 &&
											breakdownItems.length > 0 && (
												<div className="space-y-3 rounded-xl border border-border bg-surface-subtle/60 p-3.5">
													<div className="flex items-baseline justify-between gap-2">
														<span className="font-semibold text-foreground text-xs sm:text-sm">
															Distribusi Komponen Nilai Pribadi
														</span>
														<span className="text-muted-foreground text-xs">
															Periode berjalan / final
														</span>
													</div>
													<div className="space-y-2.5">
														{breakdownItems
															.filter(
																(item) => item.label !== "Kelengkapan evaluasi",
															)
															.map((item) => {
																const maxRef = Math.max(
																	100,
																	...breakdownItems
																		.filter(
																			(entry) =>
																				entry.label !== "Kelengkapan evaluasi",
																		)
																		.map((entry) => Math.abs(entry.value)),
																);
																const pct = Math.min(
																	100,
																	Math.max(
																		4,
																		Math.round(
																			(Math.max(0, item.value) / maxRef) * 100,
																		),
																	),
																);
																return (
																	<div key={item.label} className="space-y-1">
																		<div className="flex items-baseline justify-between gap-2 text-xs">
																			<span className="font-medium text-foreground">
																				{item.label}
																			</span>
																			<span className="font-bold text-foreground tabular-nums">
																				{numberFormat.format(item.value)}
																				{item.unit
																					? ` ${item.unit.trim()}`
																					: ""}
																			</span>
																		</div>
																		<div className="h-2.5 overflow-hidden rounded-full border border-border-control/40 bg-surface">
																			<div
																				className="h-full rounded-full bg-primary transition-[width] duration-300"
																				style={{
																					width: `${item.value <= 0 ? 0 : pct}%`,
																				}}
																			/>
																		</div>
																	</div>
																);
															})}
													</div>
												</div>
											)}
									</>
								)}

								{displayedMetric.id === "attendance" &&
									totalAttendancePool > 0 && (
										<div className="space-y-3 rounded-xl border border-border bg-surface-subtle/60 p-3.5">
											<div className="flex items-baseline justify-between gap-2">
												<span className="font-semibold text-foreground text-xs sm:text-sm">
													Komposisi Kehadiran (
													{numberFormat.format(totalAttendancePool)} kegiatan)
												</span>
												<span className="font-bold text-foreground text-xs tabular-nums">
													{numberFormat.format(presentPct)}% hadir
												</span>
											</div>
											<div className="flex h-4 overflow-hidden rounded-full border border-border-control/40 bg-surface">
												<div
													className="h-full transition-[width] duration-300"
													style={{
														width: `${presentPct}%`,
														background: "#059669",
													}}
													title={`Hadir: ${presentCount} kegiatan (${numberFormat.format(presentPct)}%)`}
												/>
												<div
													className="h-full transition-[width] duration-300"
													style={{
														width: `${absentPct}%`,
														background: "#dc3545",
													}}
													title={`Tidak hadir: ${absentCount} kegiatan (${numberFormat.format(absentPct)}%)`}
												/>
											</div>
											<div className="grid grid-cols-2 gap-2.5 text-xs">
												<div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
													<span
														className="size-3 shrink-0 rounded-sm"
														style={{ background: "#059669" }}
														aria-hidden="true"
													/>
													<div className="min-w-0">
														<p className="font-medium text-muted-foreground">
															Hadir
														</p>
														<p className="font-bold text-foreground tabular-nums">
															{numberFormat.format(presentCount)} ·{" "}
															{numberFormat.format(presentPct)}%
														</p>
													</div>
												</div>
												<div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
													<span
														className="size-3 shrink-0 rounded-sm"
														style={{ background: "#dc3545" }}
														aria-hidden="true"
													/>
													<div className="min-w-0">
														<p className="font-medium text-muted-foreground">
															Tidak hadir
														</p>
														<p className="font-bold text-foreground tabular-nums">
															{numberFormat.format(absentCount)} ·{" "}
															{numberFormat.format(absentPct)}%
														</p>
													</div>
												</div>
											</div>
										</div>
									)}

								{(displayedMetric.id === "violations" ||
									(displayedMetric.id !== "assessment" &&
										totalAttendancePool === 0)) && (
									<div className="space-y-2.5 rounded-xl border border-border bg-surface-subtle/60 p-3.5">
										{tableRows.map((row) => (
											<div
												key={row.label}
												className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-xs"
											>
												<div className="min-w-0 space-y-0.5">
													<p className="font-semibold text-foreground">
														{row.label}
													</p>
													<p className="text-muted-foreground">{row.context}</p>
												</div>
												<span className="shrink-0 font-bold text-base text-foreground tabular-nums">
													{row.display}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full text-left text-sm">
									<thead>
										<tr className="border-border border-b text-xs">
											<th className="px-3 py-2 font-semibold">Indikator</th>
											<th className="px-3 py-2 font-semibold">Proporsi</th>
											<th className="px-3 py-2 text-right font-semibold">
												Nilai
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{tableRows.map((row) => (
											<tr key={row.label}>
												<td className="px-3 py-2.5 font-medium">{row.label}</td>
												<td className="px-3 py-2.5 text-muted-foreground text-xs">
													{row.context}
												</td>
												<td className="px-3 py-2.5 text-right font-semibold tabular-nums">
													{row.display}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{canExport && fixture && (
				<DashboardExportDialog
					key={`${identityKey}:${previewMode}:${scenario}:${displayedMetric.id}`}
					metric={displayedMetric}
					fixture={fixture}
					open={exportOpen}
					onOpenChange={setExportOpen}
				/>
			)}
		</div>
	);
}

function DashboardMetricRequest({
	metric,
	onSelect,
}: {
	metric: DashboardMetric;
	onSelect: () => void;
}) {
	const [exportOpen, setExportOpen] = useState(false);
	const { identityKey, previewMode, scenarios, fixture, canManage } =
		useDashboardPreview();
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
			<DashboardMetricCard
				metric={displayed}
				preview
				onSelect={onSelect}
				onExport={
					canManage && previewMode === "management" && displayed.export
						? () => setExportOpen(true)
						: undefined
				}
			/>
			{canManage &&
				previewMode === "management" &&
				fixture &&
				displayed.export &&
				(displayed.state.kind === "ready" ||
					displayed.state.kind === "ready_summary") && (
					<DashboardExportDialog
						key={`${identityKey}:${previewMode}:${scenario}`}
						metric={displayed}
						fixture={fixture}
						open={exportOpen}
						onOpenChange={setExportOpen}
					/>
				)}
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
