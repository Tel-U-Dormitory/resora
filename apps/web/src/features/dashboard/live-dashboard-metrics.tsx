"use client";

import { Card, CardContent } from "@resora/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Download, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { triggerCsvDownload } from "@/features/penilaian/public";
import { trpc, trpcClient } from "@/utils/trpc";
import type { DashboardMetric } from "./dashboard.contracts";
import { DashboardMetrics } from "./dashboard-metrics";
import { useDashboardPreview } from "./dashboard-preview-context";

const scoreNumberFormat = new Intl.NumberFormat("id-ID", {
	maximumFractionDigits: 2,
});

export function LiveDashboardMetrics({
	showCleanliness = true,
	canAccessPenilaian = false,
}: {
	showCleanliness?: boolean;
	canAccessPenilaian?: boolean;
}) {
	const { fixture, previewMode } = useDashboardPreview();
	const [personalCsvDownloading, setPersonalCsvDownloading] = useState(false);
	const [personalCsvError, setPersonalCsvError] = useState<string | null>(null);

	const liveAssessment = useQuery({
		...trpc.penilaian.dashboardSummary.queryOptions({ mode: previewMode }),
		enabled: fixture === null,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const liveAttendance = useQuery({
		...trpc.attendance.ownDashboardSummary.queryOptions(),
		enabled: fixture === null && previewMode === "personal",
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const liveCommittee = useQuery({
		...trpc.committee.ownMemberships.queryOptions(),
		enabled: fixture === null && previewMode === "personal",
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const personalSummaryReady =
		liveAssessment.data?.mode === "personal" &&
		liveAssessment.data.state === "ready" &&
		liveAssessment.data.finalScore !== null
			? liveAssessment.data
			: null;

	const handleDownloadPersonalAssessmentCsv = personalSummaryReady
		? async () => {
				try {
					setPersonalCsvError(null);
					setPersonalCsvDownloading(true);
					const result = await trpcClient.penilaian.exportRecapCsv.query({
						evaluationPeriodId: personalSummaryReady.periodId,
						aggregateOnly: false,
					});
					triggerCsvDownload(result.filename, result.content);
				} catch (error) {
					setPersonalCsvError(
						error instanceof Error
							? error.message
							: "Rekap pribadi belum dapat diunduh saat ini.",
					);
				} finally {
					setPersonalCsvDownloading(false);
				}
			}
		: null;

	const liveAssessmentMetric: DashboardMetric = (() => {
		const scope = previewMode === "management" ? "organization" : "individual";
		if (liveAssessment.isPending) {
			return {
				id: "assessment",
				title: "Penilaian",
				period: {
					label: "Memuat periode…",
					startsAt: null,
					endsAt: null,
				},
				scope,
				state: { kind: "loading", message: "Memuat penilaian…" },
				export: null,
			};
		}
		if (liveAssessment.error) {
			const isForbidden =
				liveAssessment.error instanceof TRPCClientError &&
				liveAssessment.error.data?.code === "FORBIDDEN";
			return {
				id: "assessment",
				title: "Penilaian",
				period: {
					label: "Periode evaluasi",
					startsAt: null,
					endsAt: null,
				},
				scope,
				state: isForbidden
					? {
							kind: "forbidden",
							message: "Kamu belum memiliki izin melihat ringkasan penilaian.",
						}
					: {
							kind: "error",
							message: "Data penilaian belum dapat dimuat.",
						},
				export: null,
			};
		}
		const summary = liveAssessment.data;
		if (!summary) {
			return {
				id: "assessment",
				title: "Penilaian",
				period: {
					label: "Periode evaluasi belum tersedia",
					startsAt: null,
					endsAt: null,
				},
				scope,
				state: { kind: "unavailable", message: "Data belum tersedia." },
				export: null,
			};
		}
		const period = {
			label: summary.periodName ?? "Periode evaluasi belum tersedia",
			startsAt: null,
			endsAt: null,
		};
		if (summary.state === "missing_period") {
			return {
				id: "assessment",
				title: "Penilaian",
				period,
				scope,
				state: { kind: "missing_period", message: summary.message },
				export: null,
			};
		}
		if (summary.state === "unavailable") {
			return {
				id: "assessment",
				title: "Penilaian",
				period,
				scope,
				state: { kind: "unavailable", message: summary.message },
				export: null,
			};
		}
		if (summary.state === "not_assessed") {
			return {
				id: "assessment",
				title: "Penilaian",
				period,
				scope,
				state: { kind: "not_assessed", message: summary.message },
				export: null,
			};
		}
		if (summary.state === "ready") {
			if (summary.finalScore === null) {
				return {
					id: "assessment",
					title: "Penilaian",
					period,
					scope: "individual",
					state: {
						kind: "not_assessed",
						message: "Data penilaian pribadi belum tersedia pada periode ini.",
					},
					export: null,
				};
			}
			const componentValues: Array<{
				label: string;
				value: number;
				unit: string | null;
			}> = [
				{
					label: "Nilai Akhir",
					value: summary.finalScore,
					unit: null,
				},
				{
					label: "Kelengkapan evaluasi",
					value: summary.completionPercentage,
					unit: "%",
				},
				...(summary.components.annualWeighted !== null
					? [
							{
								label: "Event Tahunan",
								value: summary.components.annualWeighted,
								unit: null,
							},
						]
					: []),
				...(summary.components.monthlyWeighted !== null
					? [
							{
								label: "Event Bulanan",
								value: summary.components.monthlyWeighted,
								unit: null,
							},
						]
					: []),
				...(summary.components.weeklyWeighted !== null
					? [
							{
								label: "Event Mingguan",
								value: summary.components.weeklyWeighted,
								unit: null,
							},
						]
					: []),
				...(summary.components.departmentWeighted !== null
					? [
							{
								label: "Penilaian Departemen",
								value: summary.components.departmentWeighted,
								unit: null,
							},
						]
					: []),
				...(summary.components.gformWeighted !== null
					? [
							{
								label: "Evaluasi GForm",
								value: summary.components.gformWeighted,
								unit: null,
							},
						]
					: []),
				...(summary.components.externalScoreAverage !== null
					? [
							{
								label: "Kegiatan Eksternal",
								value: summary.components.externalScoreAverage,
								unit: "/50",
							},
						]
					: []),
				{
					label: "Poin Kehadiran",
					value: summary.attendancePointsTotal,
					unit: "poin",
				},
				{
					label: "Penyesuaian Poin (+/-)",
					value: summary.netAdjustmentPoints,
					unit: "poin",
				},
			];
			return {
				id: "assessment",
				title: "Penilaian",
				period,
				scope: "individual",
				state: {
					kind: "ready_summary",
					values: componentValues,
					note:
						summary.thresholdStatus === "MEMENUHI_STANDAR"
							? "Memenuhi standar kinerja"
							: summary.thresholdStatus === "PERLU_PENINGKATAN"
								? "Perlu peningkatan"
								: "Nilai berbobot final",
				},
				export: null,
			};
		}
		return {
			id: "assessment",
			title: "Penilaian",
			period,
			scope: "organization",
			state: {
				kind: "ready_summary",
				values: [
					...(summary.averageScore !== null
						? [
								{
									label: "Rata-rata nilai SR",
									value: summary.averageScore,
									unit: null,
								},
							]
						: []),
					{
						label: "Kelengkapan",
						value: summary.completionPercentage,
						unit: "%",
					},
					{
						label: "Sudah dinilai",
						value: summary.assessedCount,
						unit: "SR",
					},
					{
						label: "Belum dinilai",
						value: summary.unassessedCount,
						unit: "SR",
					},
				],
				note: summary.isFinalized ? "Periode final" : "Berjalan (pra-final)",
			},
			export: null,
		};
	})();

	const liveAttendanceMetric: DashboardMetric | undefined = (() => {
		if (previewMode !== "personal" || fixture !== null) return undefined;
		if (liveAttendance.isPending) {
			return {
				id: "attendance",
				title: "Kehadiran",
				period: {
					label: "Memuat periode…",
					startsAt: null,
					endsAt: null,
				},
				scope: "individual",
				state: { kind: "loading", message: "Memuat kehadiran pribadi…" },
				export: null,
			};
		}
		if (liveAttendance.error) {
			return {
				id: "attendance",
				title: "Kehadiran",
				period: {
					label: "Periode menjabat",
					startsAt: null,
					endsAt: null,
				},
				scope: "individual",
				state: {
					kind: "error",
					message: "Ringkasan kehadiran pribadi belum dapat dimuat.",
				},
				export: null,
			};
		}
		const att = liveAttendance.data;
		if (!att) return undefined;
		const period = {
			label: att.periodName ?? "Periode menjabat belum tersedia",
			startsAt: att.state === "ready" ? att.startsOn : null,
			endsAt: att.state === "ready" ? att.endsOn : null,
		};
		if (att.state !== "ready") {
			return {
				id: "attendance",
				title: "Kehadiran",
				period,
				scope: "individual",
				state: { kind: att.state, message: att.message },
				export: null,
			};
		}
		return {
			id: "attendance",
			title: "Kehadiran",
			period,
			scope: "individual",
			state: {
				kind: "ready_summary",
				values: [
					{
						label: "Total kegiatan relevan",
						value: att.eventCount,
						unit: null,
					},
					{
						label: "Hadir",
						value: att.attendedCount,
						unit: null,
					},
					{
						label: "Tidak hadir",
						value: att.absentCount,
						unit: null,
					},
					{
						label: "Total poin kehadiran",
						value: att.totalPoints,
						unit: "poin",
					},
				],
				note: `${att.attendedCount} dari ${att.eventCount} kegiatan`,
			},
			export: null,
		};
	})();

	const componentBars = personalSummaryReady
		? [
				{
					label: "Event Tahunan",
					value: personalSummaryReady.components.annualWeighted,
					unit: "",
				},
				{
					label: "Event Bulanan",
					value: personalSummaryReady.components.monthlyWeighted,
					unit: "",
				},
				{
					label: "Event Mingguan",
					value: personalSummaryReady.components.weeklyWeighted,
					unit: "",
				},
				{
					label: "Penilaian Departemen",
					value: personalSummaryReady.components.departmentWeighted,
					unit: "",
				},
				{
					label: "Evaluasi GForm",
					value: personalSummaryReady.components.gformWeighted,
					unit: "",
				},
				{
					label: "Kegiatan Eksternal",
					value: personalSummaryReady.components.externalScoreAverage,
					unit: "/50",
				},
				{
					label: "Poin Kehadiran",
					value: personalSummaryReady.attendancePointsTotal,
					unit: " poin",
				},
				{
					label: "Penyesuaian Poin (+/-)",
					value: personalSummaryReady.netAdjustmentPoints,
					unit: " poin",
				},
			].filter(
				(item): item is { label: string; value: number; unit: string } =>
					item.value !== null,
			)
		: [];

	const maxBarValue = Math.max(
		100,
		...componentBars.map((item) => Math.abs(item.value)),
	);

	return (
		<div className="resora-dashboard-kpis-group space-y-5">
			<DashboardMetrics
				showCleanliness={showCleanliness}
				canAccessPenilaian={canAccessPenilaian}
				liveAssessmentMetric={liveAssessmentMetric}
				liveAttendanceMetric={liveAttendanceMetric}
				onDownloadPersonalAssessmentCsv={handleDownloadPersonalAssessmentCsv}
				personalCsvDownloading={personalCsvDownloading}
				personalCsvError={personalCsvError}
			/>

			{previewMode === "personal" && fixture === null && (
				<div className="grid grid-cols-1 items-stretch gap-5 min-[1200px]:grid-cols-12">
					<Card className="flex flex-col min-[1200px]:col-span-7">
						<CardContent className="flex flex-1 flex-col justify-between gap-4 p-4 sm:p-5">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 space-y-0.5">
									<h3 className="font-bold text-base text-foreground">
										Statistik Penilaian Pribadi
									</h3>
									<p className="truncate text-muted-foreground text-xs">
										{liveAssessment.data?.periodName ??
											"Rekap nilai periode final pribadi"}
									</p>
								</div>
								{handleDownloadPersonalAssessmentCsv && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-h-9 shrink-0 gap-1.5"
										disabled={personalCsvDownloading}
										onClick={() => void handleDownloadPersonalAssessmentCsv()}
									>
										<Download size={14} aria-hidden="true" />
										<span>
											{personalCsvDownloading
												? "Mengunduh…"
												: "Unduh Rekap (CSV)"}
										</span>
									</Button>
								)}
							</div>

							{personalCsvError && (
								<p role="alert" className="text-danger text-xs">
									{personalCsvError}
								</p>
							)}

							{personalSummaryReady &&
							personalSummaryReady.finalScore !== null ? (
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle/60 px-4 py-3">
										<div>
											<p className="text-muted-foreground text-xs">
												Nilai Akhir Berbobot
											</p>
											<p className="font-bold text-2xl text-foreground tabular-nums">
												{scoreNumberFormat.format(
													personalSummaryReady.finalScore,
												)}
											</p>
										</div>
										<span
											className={`shrink-0 rounded-full border px-2.5 py-1 font-semibold text-xs ${
												personalSummaryReady.thresholdStatus ===
												"MEMENUHI_STANDAR"
													? "border-success/30 bg-success-tint text-success"
													: personalSummaryReady.thresholdStatus ===
															"PERLU_PENINGKATAN"
														? "border-warning/30 bg-warning-tint text-warning"
														: "border-border bg-surface text-foreground"
											}`}
										>
											{personalSummaryReady.thresholdStatus ===
											"MEMENUHI_STANDAR"
												? "Memenuhi Standar"
												: personalSummaryReady.thresholdStatus ===
														"PERLU_PENINGKATAN"
													? "Perlu Peningkatan"
													: "Periode Final"}
										</span>
									</div>

									<div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
										{componentBars.map((item) => {
											const pct = Math.min(
												100,
												Math.max(
													4,
													Math.round(
														(Math.max(0, item.value) / maxBarValue) * 100,
													),
												),
											);
											return (
												<div key={item.label} className="space-y-1.5">
													<div className="flex items-baseline justify-between gap-2 text-xs">
														<span className="truncate font-medium text-foreground">
															{item.label}
														</span>
														<span className="shrink-0 font-semibold text-foreground tabular-nums">
															{scoreNumberFormat.format(item.value)}
															{item.unit}
														</span>
													</div>
													<div className="h-2 overflow-hidden rounded-full border border-border-control/40 bg-surface-subtle">
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
							) : (
								<p className="text-muted-foreground text-sm">
									{liveAssessment.isPending
										? "Memuat statistik penilaian pribadi…"
										: liveAssessment.data && "message" in liveAssessment.data
											? liveAssessment.data.message
											: "Nilai final pribadi tersedia setelah periode difinalisasi."}
								</p>
							)}
						</CardContent>
					</Card>

					<Card className="flex flex-col min-[1200px]:col-span-5">
						<CardContent className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 space-y-0.5">
									<h3 className="font-bold text-base text-foreground">
										Keaktifan Kepanitiaan
									</h3>
									<p className="text-muted-foreground text-xs">
										Riwayat divisi dan jabatan kepanitiaan aktifmu
									</p>
								</div>
								<span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface-subtle px-2.5 py-1 font-bold text-foreground text-xs tabular-nums">
									<Users size={13} aria-hidden="true" />
									{liveCommittee.data?.totalCommittees ?? 0} kepanitiaan
								</span>
							</div>

							{liveCommittee.isPending ? (
								<p className="text-muted-foreground text-sm">
									Memuat riwayat kepanitiaan…
								</p>
							) : liveCommittee.error ? (
								<p role="alert" className="text-danger text-sm">
									Data keaktifan kepanitiaan belum dapat dimuat.
								</p>
							) : (liveCommittee.data?.items.length ?? 0) === 0 ? (
								<p className="text-muted-foreground text-sm">
									Belum terdaftar pada kepanitiaan apa pun di periode ini.
								</p>
							) : (
								<ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle/35">
									{liveCommittee.data?.items.map((item) => (
										<li
											key={`${item.committeeId}:${item.divisionName}:${item.positionCode}`}
											className="flex items-center justify-between gap-3 px-4 py-3"
										>
											<div className="min-w-0 flex-1 space-y-0.5">
												<p className="truncate font-semibold text-foreground text-sm">
													{item.committeeName}
												</p>
												<p className="truncate text-muted-foreground text-xs">
													Divisi {item.divisionName}
												</p>
											</div>
											<span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-0.5 font-semibold text-foreground text-xs">
												{item.positionCode}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
