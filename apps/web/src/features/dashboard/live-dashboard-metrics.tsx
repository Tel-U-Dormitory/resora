"use client";

import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/utils/trpc";
import type { DashboardMetric } from "./dashboard.contracts";
import { DashboardMetrics } from "./dashboard-metrics";
import { useDashboardPreview } from "./dashboard-preview-context";

export function LiveDashboardMetrics({
	showCleanliness = true,
}: {
	showCleanliness?: boolean;
}) {
	const { fixture, previewMode } = useDashboardPreview();
	const liveAssessment = useQuery({
		...trpc.penilaian.dashboardSummary.queryOptions({ mode: previewMode }),
		enabled: fixture === null,
		retry: false,
		meta: { errorHandledLocally: true },
	});

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
			return {
				id: "assessment",
				title: "Penilaian",
				period,
				scope: "individual",
				state: {
					kind: "ready",
					value: summary.finalScore,
					unit: null,
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

	return (
		<DashboardMetrics
			showCleanliness={showCleanliness}
			liveAssessmentMetric={liveAssessmentMetric}
		/>
	);
}
