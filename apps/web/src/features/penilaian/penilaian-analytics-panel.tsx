"use client";

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { Input } from "@resora/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc, trpcClient } from "@/utils/trpc";
import {
	formatPenilaianScore,
	formatPeriodStatusLabel,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
	triggerCsvDownload,
} from "./penilaian-ui";

export function PenilaianAnalyticsPanel({
	evaluationPeriodId,
	canViewPreFinal,
	canViewAllFinal,
}: {
	evaluationPeriodId: string;
	canViewPreFinal: boolean;
	canViewAllFinal: boolean;
}) {
	const [search, setSearch] = useState("");
	const [departmentCode, setDepartmentCode] = useState("");
	const [buildingCode, setBuildingCode] = useState("");
	const [page, setPage] = useState(1);
	const [selectedTargetUserId, setSelectedTargetUserId] = useState<
		string | null
	>(null);
	const [exportError, setExportError] = useState("");

	const filterInput = {
		evaluationPeriodId,
		...(search.trim() ? { query: search.trim() } : {}),
		...(departmentCode.trim() ? { departmentCode: departmentCode.trim() } : {}),
		...(buildingCode.trim() ? { buildingCode: buildingCode.trim() } : {}),
	};

	const analyticsQuery = useQuery({
		...trpc.penilaian.analytics.queryOptions(filterInput),
		enabled: Boolean(evaluationPeriodId) && canViewAllFinal,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const recapQuery = useQuery({
		...trpc.penilaian.recapList.queryOptions(filterInput),
		enabled: Boolean(evaluationPeriodId) && canViewAllFinal,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const detailQuery = useQuery({
		...trpc.penilaian.memberDetail.queryOptions({
			evaluationPeriodId,
			targetUserId: selectedTargetUserId ?? "",
		}),
		enabled: Boolean(evaluationPeriodId) && Boolean(selectedTargetUserId),
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const auditsQuery = useQuery({
		...trpc.penilaian.auditHistory.queryOptions({ evaluationPeriodId }),
		enabled: Boolean(evaluationPeriodId) && canViewPreFinal,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const handleExport = async (aggregateOnly: boolean) => {
		try {
			setExportError("");
			const result = await trpcClient.penilaian.exportRecapCsv.query({
				...filterInput,
				aggregateOnly,
			});
			triggerCsvDownload(result.filename, result.content);
		} catch (err) {
			setExportError(penilaianErrorMessage(err));
		}
	};

	if (analyticsQuery.isLoading || recapQuery.isLoading) {
		return (
			<Card>
				<CardContent className="p-5">
					<p className="text-muted-foreground text-sm">
						Memuat analitik dan rekap seluruh SR…
					</p>
				</CardContent>
			</Card>
		);
	}

	if (analyticsQuery.error || recapQuery.error) {
		return (
			<Card>
				<CardContent className="p-5">
					<p role="alert" className="text-danger text-sm">
						{penilaianErrorMessage(analyticsQuery.error ?? recapQuery.error)}
					</p>
				</CardContent>
			</Card>
		);
	}

	const analytics = analyticsQuery.data;
	const recap = recapQuery.data;
	if (!analytics || !recap) return null;

	const maxBucket = Math.max(
		1,
		...analytics.distribution.map((bucket) => bucket.count),
	);

	return (
		<div className="space-y-4">
			<Card>
				<CardContent className="space-y-4 p-5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 className="font-bold text-base text-foreground">
								Analitik Kinerja SR · {analytics.period.name}
							</h2>
							<p className="text-muted-foreground text-xs">
								Status: {formatPeriodStatusLabel(analytics.period.status)} ·
								Versi {analytics.period.version}
							</p>
						</div>
						<div className="flex flex-wrap gap-2 print:hidden">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-11"
								onClick={() => window.print()}
							>
								Cetak / Simpan PDF
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-11"
								onClick={() => void handleExport(false)}
							>
								Ekspor Rekap CSV
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-11"
								onClick={() => void handleExport(true)}
							>
								Ekspor Agregat Departemen
							</Button>
						</div>
					</div>

					{exportError && (
						<p role="alert" className="text-danger text-sm">
							{exportError}
						</p>
					)}

					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						<div className="rounded-xl border border-border bg-surface-subtle p-3.5">
							<p className="text-muted-foreground text-xs">
								Kelengkapan Penilaian
							</p>
							<p className="mt-1 font-bold text-foreground text-xl tabular-nums">
								{formatPenilaianScore(analytics.summary.completionPercentage)}%
							</p>
							<p className="text-[11px] text-muted-foreground">
								{analytics.summary.assessedCount} / {analytics.summary.totalSr}{" "}
								SR lengkap
							</p>
						</div>
						<div className="rounded-xl border border-border bg-surface-subtle p-3.5">
							<p className="text-muted-foreground text-xs">
								Rata-rata Nilai Total
							</p>
							<p className="mt-1 font-bold text-foreground text-xl tabular-nums">
								{formatPenilaianScore(analytics.summary.averageTotalScore)}
							</p>
							<p className="text-[11px] text-muted-foreground">
								SR yang telah lengkap
							</p>
						</div>
						<div className="rounded-xl border border-border bg-surface-subtle p-3.5">
							<p className="text-muted-foreground text-xs">Nilai Terendah</p>
							<p className="mt-1 font-bold text-foreground text-xl tabular-nums">
								{formatPenilaianScore(analytics.summary.minTotalScore)}
							</p>
						</div>
						<div className="rounded-xl border border-border bg-surface-subtle p-3.5">
							<p className="text-muted-foreground text-xs">Nilai Tertinggi</p>
							<p className="mt-1 font-bold text-foreground text-xl tabular-nums">
								{formatPenilaianScore(analytics.summary.maxTotalScore)}
							</p>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<div className="space-y-2.5 rounded-xl border border-border bg-surface-subtle p-4">
							<h3 className="font-bold text-foreground text-sm">
								Distribusi Nilai SR
							</h3>
							<div className="space-y-2">
								{analytics.distribution.map((bucket) => (
									<div key={bucket.label} className="space-y-1">
										<div className="flex justify-between text-xs">
											<span className="font-medium text-foreground">
												{bucket.label}
											</span>
											<span className="text-muted-foreground tabular-nums">
												{bucket.count} SR
											</span>
										</div>
										<div className="h-2.5 overflow-hidden rounded-full border border-border bg-surface">
											<div
												className="h-full rounded-full bg-primary"
												style={{
													width: `${Math.round((bucket.count / maxBucket) * 100)}%`,
												}}
											/>
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="space-y-2.5 rounded-xl border border-border bg-surface-subtle p-4">
							<h3 className="font-bold text-foreground text-sm">
								Rata-rata per Departemen
							</h3>
							<div className="divide-y divide-border rounded-xl border border-border bg-surface">
								{analytics.byDepartment.map((dept) => (
									<div
										key={dept.departmentCode}
										className="flex items-center justify-between px-3 py-2 text-xs"
									>
										<span className="font-semibold text-foreground">
											{dept.departmentCode} ({dept.assessedCount}/{dept.totalSr}
											)
										</span>
										<span className="font-bold text-foreground tabular-nums">
											{formatPenilaianScore(dept.averageTotalScore)}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="space-y-4 p-5">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<Input
							aria-label="Cari NIM atau nama SR"
							className="min-h-11"
							placeholder="Cari NIM atau nama SR…"
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
							}}
						/>
						<Input
							aria-label="Filter departemen"
							className="min-h-11"
							placeholder="Filter departemen (contoh: HCO)"
							value={departmentCode}
							onChange={(event) => {
								setDepartmentCode(event.target.value);
								setPage(1);
							}}
						/>
						<Input
							aria-label="Filter gedung"
							className="min-h-11"
							placeholder="Filter kode gedung (contoh: A1)"
							value={buildingCode}
							onChange={(event) => {
								setBuildingCode(event.target.value);
								setPage(1);
							}}
						/>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-border border-b text-muted-foreground text-xs">
									<th className="px-3 py-2 font-semibold">SR</th>
									<th className="px-3 py-2 font-semibold">Dept / Gedung</th>
									<th className="px-3 py-2 font-semibold">Kelengkapan</th>
									<th className="px-3 py-2 text-right font-semibold">
										Total Nilai
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										Kehadiran
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										Poin +/-
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										Eksternal
									</th>
									<th className="px-3 py-2 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{(() => {
									const pageSize = 15;
									const totalPages = Math.max(
										1,
										Math.ceil(recap.rows.length / pageSize),
									);
									const safePage = Math.min(page, totalPages);
									return recap.rows
										.slice((safePage - 1) * pageSize, safePage * pageSize)
										.map((row) => (
											<tr key={row.userId}>
												<td className="px-3 py-2.5">
													<p className="font-semibold text-foreground">
														{row.name}
													</p>
													<p className="text-muted-foreground text-xs tabular-nums">
														{row.nim}
													</p>
												</td>
												<td className="px-3 py-2.5 text-xs">
													{row.departmentCode} · {row.buildingCode}
												</td>
												<td className="px-3 py-2.5">
													<span
														className={`rounded-full border px-2 py-0.5 font-bold text-[11px] ${penilaianStatusBadgeClass(row.isComplete ? "APPROVED" : "BELUM_LENGKAP")}`}
													>
														{row.isComplete ? "Lengkap" : "Belum Lengkap"}
													</span>
												</td>
												<td className="px-3 py-2.5 text-right font-bold tabular-nums">
													{formatPenilaianScore(row.totalWeightedScore)}
												</td>
												<td className="px-3 py-2.5 text-right tabular-nums">
													{formatPenilaianScore(row.attendancePointsTotal)}
												</td>
												<td className="px-3 py-2.5 text-right tabular-nums">
													{formatPenilaianScore(row.netAdjustmentPoints)}
												</td>
												<td className="px-3 py-2.5 text-right tabular-nums">
													{formatPenilaianScore(row.externalScoreAverage)}
												</td>
												<td className="px-3 py-2.5 text-right">
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="min-h-11"
														onClick={() => setSelectedTargetUserId(row.userId)}
													>
														Detail
													</Button>
												</td>
											</tr>
										));
								})()}
							</tbody>
						</table>
					</div>
					{recap.rows.length > 15 && (
						<div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
							<p className="text-muted-foreground tabular-nums">
								Halaman {Math.min(page, Math.ceil(recap.rows.length / 15))} dari{" "}
								{Math.ceil(recap.rows.length / 15)} · {recap.rows.length} SR
							</p>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="min-h-10"
									disabled={page <= 1}
									onClick={() => setPage((p) => Math.max(1, p - 1))}
								>
									Sebelumnya
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="min-h-10"
									disabled={page >= Math.ceil(recap.rows.length / 15)}
									onClick={() =>
										setPage((p) =>
											Math.min(Math.ceil(recap.rows.length / 15), p + 1),
										)
									}
								>
									Berikutnya
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{canViewPreFinal && auditsQuery.data && auditsQuery.data.length > 0 && (
				<Card>
					<CardContent className="space-y-3 p-5">
						<h3 className="font-bold text-base text-foreground">
							Riwayat Audit Penilaian (Terbaru)
						</h3>
						<ul className="space-y-2 text-xs">
							{auditsQuery.data.slice(0, 15).map((entry) => (
								<li
									key={entry.id}
									className="rounded-lg border border-border bg-surface-subtle px-3 py-2"
								>
									<span className="font-bold text-foreground">
										{entry.action}
									</span>
									{" · "}
									<span>{entry.actorName ?? entry.actorUserId}</span>
									{entry.targetName ? ` -> ${entry.targetName}` : ""}
									{" · "}
									<span className="text-muted-foreground">{entry.reason}</span>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			)}

			<Dialog
				open={Boolean(selectedTargetUserId)}
				onOpenChange={(open) => {
					if (!open) setSelectedTargetUserId(null);
				}}
			>
				<DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
					<DialogTitle className="font-bold text-foreground text-lg">
						Detail Penilaian SR
					</DialogTitle>
					<DialogDescription className="text-muted-foreground text-xs">
						Rincian nilai indikator, riwayat evaluasi, kehadiran, dan
						penyesuaian poin sesuai hak akses.
					</DialogDescription>
					{detailQuery.isLoading ? (
						<p className="mt-4 text-muted-foreground text-sm">Memuat detail…</p>
					) : detailQuery.error ? (
						<p role="alert" className="mt-4 text-danger text-sm">
							{penilaianErrorMessage(detailQuery.error)}
						</p>
					) : detailQuery.data ? (
						<div className="mt-4 space-y-4 text-sm">
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div>
									<p className="font-bold text-foreground">
										{detailQuery.data.member.name} (
										{detailQuery.data.member.nim})
									</p>
									<p className="text-muted-foreground text-xs">
										{detailQuery.data.member.departmentCode} ·{" "}
										{detailQuery.data.member.positionCode} ·{" "}
										{detailQuery.data.member.buildingName}
									</p>
								</div>
								{detailQuery.data.member.thresholdStatus && (
									<span
										className={`rounded-full border px-2.5 py-0.5 font-bold text-xs ${penilaianStatusBadgeClass(detailQuery.data.member.thresholdStatus)}`}
									>
										{detailQuery.data.member.thresholdStatus ===
										"MEMENUHI_STANDAR"
											? "Memenuhi Standar"
											: "Perlu Peningkatan"}
									</span>
								)}
							</div>

							<div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
								<div className="rounded-lg border border-border p-2.5">
									Event Tahunan (25%):{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.annualWeighted,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									Event Bulanan (10%):{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.monthlyWeighted,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									Event Mingguan (10%):{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.weeklyWeighted,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									Departemen (25%):{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.departmentWeighted,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									GForm SR/Maba (50%):{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.gformWeighted,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border bg-surface-subtle p-2.5">
									Total Berbobot:{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.totalWeightedScore,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									Kehadiran (RESORA / Fallback):{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.detailed?.resoraAttendancePoints,
										)}{" "}
										/{" "}
										{formatPenilaianScore(
											detailQuery.data.member.detailed
												?.fallbackAttendancePoints,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									Poin +/- Bersih:{" "}
									<strong>
										{formatPenilaianScore(
											detailQuery.data.member.netAdjustmentPoints,
										)}
									</strong>
								</div>
								<div className="rounded-lg border border-border p-2.5">
									Eksternal (ASUS/Ditmawa):{" "}
									<strong>
										{detailQuery.data.member.externalScoreAverage !== null
											? `${formatPenilaianScore(detailQuery.data.member.externalScoreAverage)} / 50`
											: "—"}
									</strong>
								</div>
							</div>

							{detailQuery.data.member.detailed && (
								<>
									{detailQuery.data.member.detailed.eventHistory.length > 0 && (
										<div className="space-y-1.5">
											<p className="font-semibold text-foreground text-xs">
												Rincian Indikator Event
											</p>
											<div className="space-y-1.5">
												{detailQuery.data.member.detailed.eventHistory.map(
													(evt) => (
														<div
															key={evt.periodEventId}
															className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs"
														>
															<div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-foreground">
																<span>
																	{evt.title} ({evt.category})
																</span>
																<span className="tabular-nums">
																	Rata-rata{" "}
																	{formatPenilaianScore(evt.rawAverage)} ·
																	Berbobot{" "}
																	{formatPenilaianScore(evt.weightedScore)}
																</span>
															</div>
															{evt.indicators && (
																<p className="mt-1 text-muted-foreground tabular-nums">
																	Komitmen{" "}
																	{formatPenilaianScore(
																		evt.indicators.commitment,
																	)}{" "}
																	· Teamwork{" "}
																	{formatPenilaianScore(
																		evt.indicators.teamwork,
																	)}{" "}
																	· Sikap{" "}
																	{formatPenilaianScore(
																		evt.indicators.attitude,
																	)}{" "}
																	· Kontribusi{" "}
																	{formatPenilaianScore(
																		evt.indicators.contribution,
																	)}
																</p>
															)}
														</div>
													),
												)}
											</div>
										</div>
									)}

									{detailQuery.data.member.detailed.departmentQuarters.length >
										0 && (
										<div className="space-y-1.5">
											<p className="font-semibold text-foreground text-xs">
												Rincian Indikator Departemen
											</p>
											{detailQuery.data.member.detailed.departmentQuarters.map(
												(q) => (
													<div
														key={q.quarterNumber}
														className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs"
													>
														<div className="flex justify-between font-semibold">
															<span>Kuartal {q.quarterNumber}</span>
															<span className="tabular-nums">
																Rata-rata {formatPenilaianScore(q.rawAverage)} ·
																Berbobot {formatPenilaianScore(q.weightedScore)}
															</span>
														</div>
														<p className="mt-1 text-muted-foreground tabular-nums">
															Komitmen {formatPenilaianScore(q.commitment)} ·
															Teamwork {formatPenilaianScore(q.teamwork)} ·
															Sikap {formatPenilaianScore(q.attitude)} ·
															Kontribusi {formatPenilaianScore(q.contribution)}
														</p>
													</div>
												),
											)}
										</div>
									)}

									{detailQuery.data.member.detailed.fallbackEntries.length >
										0 && (
										<div className="space-y-1">
											<p className="font-semibold text-foreground text-xs">
												Detail Kehadiran Fallback / Sidak
											</p>
											<ul className="space-y-1 text-xs">
												{detailQuery.data.member.detailed.fallbackEntries.map(
													(fb) => (
														<li
															key={fb.id}
															className="flex justify-between rounded border border-border px-2.5 py-1.5"
														>
															<span>
																{fb.activityTitle} ({fb.activityDate})
															</span>
															<span className="font-semibold tabular-nums">
																{formatPenilaianScore(fb.earnedPoints)} /{" "}
																{formatPenilaianScore(fb.maxPoints)}
															</span>
														</li>
													),
												)}
											</ul>
										</div>
									)}

									{detailQuery.data.member.detailed.pointTransactions.length >
										0 && (
										<div className="space-y-1">
											<p className="font-semibold text-foreground text-xs">
												Riwayat Transaksi Poin
											</p>
											<ul className="space-y-1 text-xs">
												{detailQuery.data.member.detailed.pointTransactions.map(
													(pt) => (
														<li
															key={pt.id}
															className="flex justify-between gap-2 rounded border border-border px-2.5 py-1.5"
														>
															<span>
																{pt.category}: {pt.reason} ({pt.status})
															</span>
															<span className="shrink-0 font-semibold tabular-nums">
																{pt.transactionType === "ADDITION" ? "+" : "-"}
																{formatPenilaianScore(pt.points)}
															</span>
														</li>
													),
												)}
											</ul>
										</div>
									)}

									{detailQuery.data.member.detailed.evaluatorDetails && (
										<div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-3">
											<p className="font-bold text-foreground text-xs">
												Identitas Penilai & Komentar (Khusus HCO & SUPERADMIN)
											</p>
											{detailQuery.data.member.detailed.evaluatorDetails
												.eventScores.length > 0 && (
												<div className="space-y-1">
													<p className="font-semibold text-[11px] text-muted-foreground">
														Penilaian Event
													</p>
													{detailQuery.data.member.detailed.evaluatorDetails.eventScores.map(
														(es) => (
															<div
																key={es.id}
																className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs"
															>
																<p className="font-medium text-foreground">
																	{es.eventTitle} · Penilai: {es.evaluatorName}{" "}
																	({formatPenilaianScore(es.averageScore)})
																</p>
																<p className="text-[11px] text-muted-foreground tabular-nums">
																	K:{es.commitment} · T:{es.teamwork} · S:
																	{es.attitude} · Kt:{es.contribution}
																</p>
																{es.comment && (
																	<p className="mt-0.5 text-foreground italic">
																		“{es.comment}”
																	</p>
																)}
															</div>
														),
													)}
												</div>
											)}
											{detailQuery.data.member.detailed.evaluatorDetails
												.departmentScores.length > 0 && (
												<div className="space-y-1">
													<p className="font-semibold text-[11px] text-muted-foreground">
														Penilaian Departemen
													</p>
													{detailQuery.data.member.detailed.evaluatorDetails.departmentScores.map(
														(ds) => (
															<div
																key={ds.id}
																className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs"
															>
																<p className="font-medium text-foreground">
																	Q{ds.quarterNumber} · Penilai:{" "}
																	{ds.evaluatorName} (
																	{formatPenilaianScore(ds.averageScore)})
																</p>
																<p className="text-[11px] text-muted-foreground tabular-nums">
																	K:{ds.commitment} · T:{ds.teamwork} · S:
																	{ds.attitude} · Kt:{ds.contribution}
																</p>
																{ds.comment && (
																	<p className="mt-0.5 text-foreground italic">
																		“{ds.comment}”
																	</p>
																)}
															</div>
														),
													)}
												</div>
											)}
											{detailQuery.data.member.detailed.evaluatorDetails
												.gformResponses.length > 0 && (
												<div className="space-y-1">
													<p className="font-semibold text-[11px] text-muted-foreground">
														Respons GForm (Responden & Komentar)
													</p>
													{detailQuery.data.member.detailed.evaluatorDetails.gformResponses.map(
														(gf) => (
															<div
																key={gf.id}
																className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs"
															>
																<p className="font-medium text-foreground">
																	{gf.sourceType === "SR_MABA"
																		? "GForm SR/Maba"
																		: "Eksternal"}{" "}
																	S{gf.cycleNumber} · {gf.respondentKey} (
																	{gf.respondentRole}) · Skor {gf.totalScore}
																</p>
																{gf.comment && (
																	<p className="mt-0.5 text-foreground italic">
																		“{gf.comment}”
																	</p>
																)}
															</div>
														),
													)}
												</div>
											)}
										</div>
									)}
								</>
							)}

							{detailQuery.data.member.missingComponents.length > 0 && (
								<p className="text-warning text-xs">
									Belum lengkap:{" "}
									{detailQuery.data.member.missingComponents.join(", ")}
								</p>
							)}
						</div>
					) : null}
					<div className="mt-5 flex justify-end">
						<DialogClose
							render={
								<Button type="button" variant="outline" className="min-h-11">
									Tutup
								</Button>
							}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
