"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
	formatPenilaianScore,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
} from "./penilaian-ui";

type OwnRecapData =
	| { status: "BELUM_TERSEDIA"; period: null; recap: null }
	| {
			status: "BELUM_FINAL";
			period: {
				id: string;
				name: string;
				status: "BELUM_FINAL";
				version: number;
			};
			recap: null;
	  }
	| {
			status: "FINAL";
			period: {
				id: string;
				name: string;
				status: "FINAL";
				version: number;
				performanceThreshold: number | null;
				finalizedAt: string | Date | null;
			};
			recap: {
				userId: string;
				nim: string;
				name: string;
				departmentCode: string;
				positionCode: string;
				buildingCode: string;
				buildingName: string;
				annualWeighted: number | null;
				monthlyWeighted: number | null;
				weeklyWeighted: number | null;
				departmentWeighted: number | null;
				gformWeighted: number | null;
				totalWeightedScore: number | null;
				attendancePointsTotal: number;
				netAdjustmentPoints: number;
				externalScoreAverage: number | null;
				isComplete: boolean;
				missingComponents: string[];
				thresholdStatus: "MEMENUHI_STANDAR" | "PERLU_PENINGKATAN" | null;
			} | null;
	  };

export function PenilaianRecapPanel({
	data,
	isLoading,
	error,
	onRetry,
}: {
	data: OwnRecapData | undefined;
	isLoading: boolean;
	error: unknown;
	onRetry: () => void;
}) {
	if (isLoading) {
		return (
			<Card>
				<CardContent className="space-y-3 p-5">
					<p className="text-muted-foreground text-sm">
						Memuat rekap penilaian pribadi…
					</p>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="space-y-3 p-5">
					<p role="alert" className="font-medium text-danger text-sm">
						{penilaianErrorMessage(error)}
					</p>
					<button
						type="button"
						onClick={onRetry}
						className="focus-ring min-h-11 rounded-xl border border-border bg-surface px-4 font-semibold text-sm hover:bg-surface-subtle"
					>
						Muat ulang
					</button>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.status === "BELUM_TERSEDIA") {
		return (
			<Card>
				<CardContent className="space-y-2 p-5">
					<h2 className="font-bold text-base text-foreground">
						Rekap Penilaian Pribadi
					</h2>
					<p role="status" className="text-muted-foreground text-sm">
						Periode evaluasi belum tersedia. Hubungi HCO untuk membuat dan
						mengaktifkan periode penilaian.
					</p>
				</CardContent>
			</Card>
		);
	}

	if (data.status === "BELUM_FINAL") {
		return (
			<Card>
				<CardContent className="space-y-3 p-5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 className="font-bold text-base text-foreground">
								{data.period.name}
							</h2>
							<p className="text-muted-foreground text-xs">
								Versi {data.period.version}
							</p>
						</div>
						<span className="rounded-full border border-border bg-[var(--warning-tint)] px-3 py-1 font-bold text-warning text-xs">
							Belum Final
						</span>
					</div>
					<p role="status" className="text-muted-foreground text-sm">
						Hasil penilaian periode ini masih diproses oleh HCO dan belum
						difinalisasi. Kamu tetap dapat mengisi penilaian event atau
						departemen pada tab Input Penilaian.
					</p>
				</CardContent>
			</Card>
		);
	}

	const recap = data.recap;
	if (!recap) {
		return (
			<Card>
				<CardContent className="space-y-2 p-5">
					<h2 className="font-bold text-base text-foreground">
						{data.period.name}
					</h2>
					<p role="status" className="text-muted-foreground text-sm">
						Data penilaianmu belum tercatat pada snapshot periode final ini.
					</p>
				</CardContent>
			</Card>
		);
	}

	const kpiComponents = [
		{ label: "Event Tahunan", weight: "25%", value: recap.annualWeighted },
		{ label: "Event Bulanan", weight: "10%", value: recap.monthlyWeighted },
		{ label: "Event Mingguan", weight: "10%", value: recap.weeklyWeighted },
		{
			label: "Penilaian Departemen",
			weight: "25%",
			value: recap.departmentWeighted,
		},
		{ label: "GForm SR & Maba", weight: "50%", value: recap.gformWeighted },
	];

	return (
		<div className="space-y-4">
			<Card>
				<CardContent className="space-y-4 p-5">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="space-y-1">
							<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
								Rekap Final · {data.period.name} (v{data.period.version})
							</p>
							<h2 className="font-bold text-foreground text-xl">
								{recap.name} · {recap.nim}
							</h2>
							<p className="text-muted-foreground text-sm">
								{recap.departmentCode} · {recap.positionCode} ·{" "}
								{recap.buildingName}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span
								className={`rounded-full border px-3 py-1 font-bold text-xs ${penilaianStatusBadgeClass("FINAL")}`}
							>
								Final
							</span>
							{recap.thresholdStatus &&
								data.period.performanceThreshold !== null && (
									<span
										className={`rounded-full border px-3 py-1 font-bold text-xs ${penilaianStatusBadgeClass(recap.thresholdStatus)}`}
									>
										{recap.thresholdStatus === "MEMENUHI_STANDAR"
											? `Memenuhi Standar (≥ ${formatPenilaianScore(data.period.performanceThreshold)})`
											: `Perlu Peningkatan (< ${formatPenilaianScore(data.period.performanceThreshold)})`}
									</span>
								)}
						</div>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<div className="rounded-xl border border-border bg-surface-subtle p-4">
							<p className="font-medium text-muted-foreground text-xs">
								Total Nilai Berbobot
							</p>
							<p className="mt-1 font-bold text-2xl text-foreground tabular-nums">
								{formatPenilaianScore(recap.totalWeightedScore)}
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Tanpa pembatasan batas atas 100
							</p>
						</div>

						<div className="rounded-xl border border-border bg-surface-subtle p-4">
							<p className="font-medium text-muted-foreground text-xs">
								Poin Kehadiran
							</p>
							<p className="mt-1 font-bold text-2xl text-foreground tabular-nums">
								{formatPenilaianScore(recap.attendancePointsTotal)}
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Poin kehadiran periode berjalan
							</p>
						</div>

						<div className="rounded-xl border border-border bg-surface-subtle p-4">
							<p className="font-medium text-muted-foreground text-xs">
								Poin Tambahan / Pengurangan
							</p>
							<p className="mt-1 font-bold text-2xl text-foreground tabular-nums">
								{recap.netAdjustmentPoints > 0
									? `+${formatPenilaianScore(recap.netAdjustmentPoints)}`
									: formatPenilaianScore(recap.netAdjustmentPoints)}
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Akumulasi transaksi disetujui
							</p>
						</div>

						<div className="rounded-xl border border-border bg-surface-subtle p-4">
							<p className="font-medium text-muted-foreground text-xs">
								Evaluasi Eksternal (ASUS/Ditmawa)
							</p>
							<p className="mt-1 font-bold text-2xl text-foreground tabular-nums">
								{formatPenilaianScore(recap.externalScoreAverage)}
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Disajikan terpisah dari Total Nilai
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="space-y-3 p-5">
					<h3 className="font-bold text-base text-foreground">
						Rincian Komponen Penilaian
					</h3>
					<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
						{kpiComponents.map((item) => (
							<div
								key={item.label}
								className="rounded-xl border border-border bg-surface p-3.5"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium text-muted-foreground text-xs">
										{item.label}
									</span>
									<span className="rounded bg-surface-subtle px-1.5 py-0.5 font-semibold text-[11px] text-text-secondary">
										{item.weight}
									</span>
								</div>
								<p className="mt-2 font-bold text-foreground text-lg tabular-nums">
									{formatPenilaianScore(item.value)}
								</p>
							</div>
						))}
					</div>
					{!recap.isComplete && recap.missingComponents.length > 0 && (
						<p role="status" className="font-medium text-warning text-xs">
							Komponen belum lengkap: {recap.missingComponents.join(", ")}
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
