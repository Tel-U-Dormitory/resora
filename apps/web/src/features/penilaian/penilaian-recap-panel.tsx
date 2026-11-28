"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	formatPenilaianScore,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
} from "./penilaian-ui";

type DetailedRecapBreakdown = {
	eventHistory: Array<{
		periodEventId: string;
		title: string;
		category: "ANNUAL" | "MONTHLY" | "WEEKLY";
		weight: number;
		isMandatory: boolean;
		expectedEvaluators: number;
		submittedEvaluators: number;
		rawAverage: number | null;
		weightedScore: number | null;
		isComplete: boolean;
		indicators: {
			commitment: number | null;
			teamwork: number | null;
			attitude: number | null;
			contribution: number | null;
		} | null;
	}>;
	departmentQuarters: Array<{
		quarterNumber: number;
		evaluatorCount: number;
		commitment: number | null;
		teamwork: number | null;
		attitude: number | null;
		contribution: number | null;
		rawAverage: number | null;
		weightedScore: number | null;
	}>;
	departmentScoreAverage: number | null;
	gformScoreAverage: number | null;
	externalResponseCount: number;
	resoraAttendancePoints: number;
	fallbackAttendancePoints: number;
	fallbackEntries: Array<{
		id: string;
		activityType: string;
		activityTitle: string;
		activityDate: string;
		attendanceStatus: string;
		earnedPoints: number;
		maxPoints: number;
	}>;
	approvedAdditionPoints: number;
	approvedDeductionPoints: number;
	pointTransactions: Array<{
		id: string;
		transactionType: "ADDITION" | "DEDUCTION";
		points: number;
		category: string;
		reason: string;
		occurredOn: string;
		status: "PENDING" | "APPROVED" | "REJECTED";
	}>;
};

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
				detailed?: DetailedRecapBreakdown;
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
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-10 gap-1.5 print:hidden"
								onClick={() => window.print()}
							>
								<Printer size={14} aria-hidden="true" />
								<span>Cetak / Simpan PDF</span>
							</Button>
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
								{recap.externalScoreAverage !== null
									? `${formatPenilaianScore(recap.externalScoreAverage)} / 50`
									: "—"}
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								10 soal skala 1–5 · terpisah dari Total Nilai
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

			{recap.detailed && (
				<>
					{recap.detailed.eventHistory.length > 0 && (
						<Card>
							<CardContent className="space-y-3 p-5">
								<h3 className="font-bold text-base text-foreground">
									Riwayat & Rincian Indikator per Event
								</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-left text-xs">
										<thead>
											<tr className="border-border border-b text-muted-foreground">
												<th className="py-2 pr-3">Event</th>
												<th className="px-2 py-2">Kategori</th>
												<th className="px-2 py-2 text-right">Komitmen</th>
												<th className="px-2 py-2 text-right">Teamwork</th>
												<th className="px-2 py-2 text-right">Sikap</th>
												<th className="px-2 py-2 text-right">Kontribusi</th>
												<th className="px-2 py-2 text-right">Rata-rata</th>
												<th className="py-2 pl-2 text-right">Berbobot</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{recap.detailed.eventHistory.map((evt) => (
												<tr key={evt.periodEventId}>
													<td className="py-2 pr-3 font-medium text-foreground">
														{evt.title}
														<span className="ml-1.5 text-[11px] text-muted-foreground">
															({evt.submittedEvaluators}/
															{evt.expectedEvaluators} penilai)
														</span>
													</td>
													<td className="px-2 py-2">
														{evt.category === "ANNUAL"
															? "Tahunan (25%)"
															: evt.category === "MONTHLY"
																? "Bulanan (10%)"
																: "Mingguan (10%)"}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{formatPenilaianScore(evt.indicators?.commitment)}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{formatPenilaianScore(evt.indicators?.teamwork)}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{formatPenilaianScore(evt.indicators?.attitude)}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{formatPenilaianScore(evt.indicators?.contribution)}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{formatPenilaianScore(evt.rawAverage)}
													</td>
													<td className="py-2 pl-2 text-right font-semibold tabular-nums">
														{formatPenilaianScore(evt.weightedScore)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</CardContent>
						</Card>
					)}

					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						{recap.detailed.departmentQuarters.length > 0 && (
							<Card>
								<CardContent className="space-y-3 p-5">
									<h3 className="font-bold text-base text-foreground">
										Rincian Penilaian Departemen (25%)
									</h3>
									<div className="space-y-2">
										{recap.detailed.departmentQuarters.map((q) => (
											<div
												key={q.quarterNumber}
												className="rounded-xl border border-border bg-surface-subtle p-3 text-xs"
											>
												<div className="flex items-center justify-between font-semibold text-foreground">
													<span>Kuartal {q.quarterNumber}</span>
													<span className="tabular-nums">
														Rata-rata {formatPenilaianScore(q.rawAverage)} ·
														Berbobot {formatPenilaianScore(q.weightedScore)}
													</span>
												</div>
												<p className="mt-1 text-muted-foreground tabular-nums">
													Komitmen {formatPenilaianScore(q.commitment)} ·
													Teamwork {formatPenilaianScore(q.teamwork)} · Sikap{" "}
													{formatPenilaianScore(q.attitude)} · Kontribusi{" "}
													{formatPenilaianScore(q.contribution)}
												</p>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}

						<Card>
							<CardContent className="space-y-3 p-5">
								<h3 className="font-bold text-base text-foreground">
									Detail Kehadiran & Penyesuaian Poin
								</h3>
								<div className="grid grid-cols-2 gap-2 text-xs">
									<div className="rounded-lg border border-border bg-surface-subtle p-2.5">
										Poin Kehadiran RESORA:{" "}
										<strong className="tabular-nums">
											{formatPenilaianScore(
												recap.detailed.resoraAttendancePoints,
											)}
										</strong>
									</div>
									<div className="rounded-lg border border-border bg-surface-subtle p-2.5">
										Poin Fallback / Sidak:{" "}
										<strong className="tabular-nums">
											{formatPenilaianScore(
												recap.detailed.fallbackAttendancePoints,
											)}
										</strong>
									</div>
									<div className="rounded-lg border border-border bg-surface-subtle p-2.5">
										Tambahan Disetujui:{" "}
										<strong className="text-success tabular-nums">
											+
											{formatPenilaianScore(
												recap.detailed.approvedAdditionPoints,
											)}
										</strong>
									</div>
									<div className="rounded-lg border border-border bg-surface-subtle p-2.5">
										Pengurangan Disetujui:{" "}
										<strong className="text-danger tabular-nums">
											-
											{formatPenilaianScore(
												recap.detailed.approvedDeductionPoints,
											)}
										</strong>
									</div>
								</div>

								{recap.detailed.fallbackEntries.length > 0 && (
									<div className="space-y-1.5">
										<p className="font-semibold text-muted-foreground text-xs">
											Riwayat Kehadiran Fallback / Sidak
										</p>
										<ul className="space-y-1 text-xs">
											{recap.detailed.fallbackEntries.map((fb) => (
												<li
													key={fb.id}
													className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5"
												>
													<span>
														{fb.activityTitle} ({fb.activityDate})
													</span>
													<span className="font-semibold tabular-nums">
														{formatPenilaianScore(fb.earnedPoints)} /{" "}
														{formatPenilaianScore(fb.maxPoints)}
													</span>
												</li>
											))}
										</ul>
									</div>
								)}

								{recap.detailed.pointTransactions.length > 0 && (
									<div className="space-y-1.5">
										<p className="font-semibold text-muted-foreground text-xs">
											Riwayat Transaksi Poin
										</p>
										<ul className="space-y-1 text-xs">
											{recap.detailed.pointTransactions.map((pt) => (
												<li
													key={pt.id}
													className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
												>
													<span className="truncate">
														{pt.category}: {pt.reason} ({pt.occurredOn})
													</span>
													<span className="shrink-0 font-semibold tabular-nums">
														{pt.transactionType === "ADDITION" ? "+" : "-"}
														{formatPenilaianScore(pt.points)}
													</span>
												</li>
											))}
										</ul>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</>
			)}
		</div>
	);
}
