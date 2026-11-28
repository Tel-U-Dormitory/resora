"use client";

import {
	type attendanceActivityTypeSchema,
	type attendanceFallbackStatusSchema,
	calculateFallbackAttendancePoints,
} from "@resora/api/modules/penilaian/penilaian.contracts";
import { Input } from "@resora/ui/components/input";
import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PointsRecap } from "@/features/attendance/public";
import { trpc } from "@/utils/trpc";
import {
	formatPenilaianScore,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
} from "./penilaian-ui";

const activityTypeOptions: Array<{
	value: z.infer<typeof attendanceActivityTypeSchema>;
	label: string;
}> = [
	{ value: "RAPAT_ALL_PANITIA", label: "Rapat All Panitia (Maks 10)" },
	{ value: "EVENT_BESAR", label: "Event Besar (Maks 10)" },
	{ value: "EVENT_SEBAGIAN", label: "Event Sebagian (Maks 6)" },
	{ value: "SIDAK", label: "Sidak (Maks sesuai konfigurasi)" },
];

const attendanceStatusOptions: Array<{
	value: z.infer<typeof attendanceFallbackStatusSchema>;
	label: string;
}> = [
	{ value: "HADIR_TEPAT_WAKTU", label: "Hadir Tepat Waktu (10/10)" },
	{ value: "TERLAMBAT_DENGAN_IZIN", label: "Terlambat Dengan Izin (8/10)" },
	{
		value: "TERLAMBAT_TANPA_IZIN_MAX_15",
		label: "Terlambat Tanpa Izin ≤ 15 Menit (7/10)",
	},
	{
		value: "TERLAMBAT_DENGAN_IZIN_LEBIH_15",
		label: "Terlambat Dengan Izin > 15 Menit (6/10)",
	},
	{
		value: "TERLAMBAT_TANPA_IZIN_LEBIH_15",
		label: "Terlambat Tanpa Izin > 15 Menit (5/10)",
	},
	{ value: "IZIN_DI_LUAR_5K", label: "Izin di Luar 5K (3/10)" },
	{ value: "ALFA", label: "Alfa / Tanpa Keterangan (0/10)" },
];

const transactionStatusLabels: Record<string, string> = {
	PENDING: "Menunggu Verifikasi",
	APPROVED: "Disetujui",
	REJECTED: "Ditolak",
};

export function PenilaianPointsPanel({
	evaluationPeriodId,
	periodStatus,
	sidakMaxPoints,
	canManageRoutine,
	canProposePoints,
	canApprovePoints,
	canViewPreFinal,
}: {
	evaluationPeriodId: string;
	periodStatus: "OPEN" | "FINAL" | "REVISING";
	sidakMaxPoints: number;
	canManageRoutine: boolean;
	canProposePoints: boolean;
	canApprovePoints: boolean;
	canViewPreFinal: boolean;
}) {
	const queryClient = useQueryClient();
	const [showMatrix, setShowMatrix] = useState(false);
	const [attendanceSearch, setAttendanceSearch] = useState("");
	const [attendancePage, setAttendancePage] = useState(1);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	const [fbTargetUserId, setFbTargetUserId] = useState("");
	const [fbActivityType, setFbActivityType] =
		useState<z.infer<typeof attendanceActivityTypeSchema>>("RAPAT_ALL_PANITIA");
	const [fbActivityTitle, setFbActivityTitle] = useState("");
	const [fbActivityDate, setFbActivityDate] = useState(
		new Date().toISOString().slice(0, 10),
	);
	const [fbStatus, setFbStatus] =
		useState<z.infer<typeof attendanceFallbackStatusSchema>>(
			"HADIR_TEPAT_WAKTU",
		);
	const [fbNotes, setFbNotes] = useState("");

	const [txTargetUserId, setTxTargetUserId] = useState("");
	const [txType, setTxType] = useState<"ADDITION" | "DEDUCTION">("ADDITION");
	const [txPoints, setTxPoints] = useState("5");
	const [txCategory, setTxCategory] = useState("");
	const [txReason, setTxReason] = useState("");
	const [txOccurredOn, setTxOccurredOn] = useState(
		new Date().toISOString().slice(0, 10),
	);

	const canLoadSummary = canViewPreFinal || periodStatus === "FINAL";
	const attendanceQuery = useQuery({
		...trpc.penilaian.attendancePointsSummary.queryOptions({
			evaluationPeriodId,
		}),
		enabled: Boolean(evaluationPeriodId) && canLoadSummary,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const canLoadTransactions =
		canViewPreFinal || canProposePoints || periodStatus === "FINAL";
	const transactionsQuery = useQuery({
		...trpc.penilaian.listPointTransactions.queryOptions({
			evaluationPeriodId,
		}),
		enabled: Boolean(evaluationPeriodId) && canLoadTransactions,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const proposalTargetsQuery = useQuery({
		...trpc.penilaian.listPointProposalTargets.queryOptions({
			evaluationPeriodId,
		}),
		enabled: Boolean(evaluationPeriodId) && canProposePoints && !canLoadSummary,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const recordFallback = useMutation({
		...trpc.penilaian.recordAttendanceFallback.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Poin kehadiran fallback berhasil dicatat.");
			setFbActivityTitle("");
			setFbNotes("");
			void queryClient.invalidateQueries();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const proposeTx = useMutation({
		...trpc.penilaian.proposePointTransaction.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Usulan poin tambahan/pengurangan berhasil diajukan.");
			setTxCategory("");
			setTxReason("");
			void queryClient.invalidateQueries();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const decideTx = useMutation({
		...trpc.penilaian.decidePointTransaction.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Keputusan transaksi poin berhasil disimpan.");
			void queryClient.invalidateQueries();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const rosterOptions =
		attendanceQuery.data?.map((row) => ({
			userId: row.userId,
			label: `${row.name} (${row.nim})`,
		})) ??
		proposalTargetsQuery.data?.map((row) => ({
			userId: row.userId,
			label: `${row.name} (${row.nim} · ${row.departmentCode})`,
		})) ??
		[];

	const fallbackPreview = calculateFallbackAttendancePoints(
		fbActivityType,
		fbStatus,
		sidakMaxPoints,
	);

	return (
		<div className="space-y-4">
			{feedback && (
				<p
					role="status"
					className="rounded-xl border border-border bg-[var(--success-tint)] px-4 py-3 font-medium text-sm text-success"
				>
					{feedback}
				</p>
			)}
			{error && (
				<p
					role="alert"
					className="rounded-xl border border-border bg-[var(--danger-tint)] px-4 py-3 font-medium text-danger text-sm"
				>
					{error}
				</p>
			)}

			<Card>
				<CardContent className="space-y-4 p-5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 className="font-bold text-base text-foreground">
								Rekap Poin Kehadiran (RESORA + Fallback)
							</h2>
							<p className="text-muted-foreground text-xs">
								Sumber utama berasal dari modul Attendance RESORA; input
								manual/impor dipakai hanya sebagai fallback.
							</p>
						</div>
						{canManageRoutine && (
							<Button
								type="button"
								variant="outline"
								className="min-h-11"
								onClick={() => setShowMatrix((prev) => !prev)}
							>
								{showMatrix
									? "Tutup Matriks Per-Event"
									: "Matriks Poin Per-Event (RESORA)"}
							</Button>
						)}
					</div>

					{!canLoadSummary ? (
						<p role="status" className="text-muted-foreground text-sm">
							Rekap poin kehadiran semua anggota tersedia untuk HCO, Inti, dan
							SUPERADMIN sebelum finalisasi, serta dibuka setelah periode
							berstatus FINAL.
						</p>
					) : attendanceQuery.isLoading ? (
						<p className="text-muted-foreground text-sm">
							Memuat poin kehadiran…
						</p>
					) : attendanceQuery.error ? (
						<p role="alert" className="text-danger text-sm">
							{penilaianErrorMessage(attendanceQuery.error)}
						</p>
					) : !attendanceQuery.data?.length ? (
						<p role="status" className="text-muted-foreground text-sm">
							Belum ada data poin kehadiran pada periode ini.
						</p>
					) : (
						(() => {
							const needle = attendanceSearch.trim().toLowerCase();
							const filtered = attendanceQuery.data.filter(
								(row) =>
									!needle ||
									row.name.toLowerCase().includes(needle) ||
									(row.nim ?? "").toLowerCase().includes(needle),
							);
							const pageSize = 15;
							const totalPages = Math.max(
								1,
								Math.ceil(filtered.length / pageSize),
							);
							const safePage = Math.min(attendancePage, totalPages);
							const visibleRows = filtered.slice(
								(safePage - 1) * pageSize,
								safePage * pageSize,
							);
							return (
								<div className="space-y-3">
									<div className="max-w-xs">
										<Input
											aria-label="Cari NIM atau nama SR pada poin kehadiran"
											type="search"
											className="min-h-11"
											placeholder="Cari NIM atau nama SR…"
											value={attendanceSearch}
											onChange={(event) => {
												setAttendanceSearch(event.target.value);
												setAttendancePage(1);
											}}
										/>
									</div>
									<div className="overflow-x-auto">
										<table className="w-full text-left text-sm">
											<thead>
												<tr className="border-border border-b text-muted-foreground text-xs">
													<th className="px-3 py-2 font-semibold">NIM</th>
													<th className="px-3 py-2 font-semibold">Nama</th>
													<th className="px-3 py-2 text-right font-semibold">
														RESORA
													</th>
													<th className="px-3 py-2 text-right font-semibold">
														Fallback
													</th>
													<th className="px-3 py-2 text-right font-semibold">
														Total
													</th>
													<th className="px-3 py-2 text-right font-semibold">
														Hadir / Total
													</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border">
												{visibleRows.map((row) => (
													<tr key={row.userId}>
														<td className="px-3 py-2.5 text-xs tabular-nums">
															{row.nim}
														</td>
														<td className="px-3 py-2.5 font-medium">
															{row.name}
														</td>
														<td className="px-3 py-2.5 text-right tabular-nums">
															{formatPenilaianScore(row.resoraPoints)}
														</td>
														<td className="px-3 py-2.5 text-right tabular-nums">
															{formatPenilaianScore(row.fallbackPoints)}
														</td>
														<td className="px-3 py-2.5 text-right font-bold tabular-nums">
															{formatPenilaianScore(row.totalAttendancePoints)}
														</td>
														<td className="px-3 py-2.5 text-right text-muted-foreground text-xs tabular-nums">
															{row.attendedCount} / {row.eventCount}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									{totalPages > 1 && (
										<div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
											<p className="text-muted-foreground tabular-nums">
												Halaman {safePage} dari {totalPages} · {filtered.length}{" "}
												SR
											</p>
											<div className="flex items-center gap-2">
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="min-h-10"
													disabled={safePage <= 1}
													onClick={() =>
														setAttendancePage((p) => Math.max(1, p - 1))
													}
												>
													Sebelumnya
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="min-h-10"
													disabled={safePage >= totalPages}
													onClick={() =>
														setAttendancePage((p) =>
															Math.min(totalPages, p + 1),
														)
													}
												>
													Berikutnya
												</Button>
											</div>
										</div>
									)}
								</div>
							);
						})()
					)}
				</CardContent>
			</Card>

			{canManageRoutine && showMatrix && (
				<Card>
					<CardContent className="p-4 sm:p-5">
						<PointsRecap />
					</CardContent>
				</Card>
			)}

			{canManageRoutine && periodStatus !== "FINAL" && (
				<Card>
					<CardContent className="space-y-4 p-5">
						<div>
							<h3 className="font-bold text-base text-foreground">
								Catat Kehadiran Fallback (HCO)
							</h3>
							<p className="text-muted-foreground text-xs">
								Opsi Izin 5K belum diaktifkan sambil menunggu definisi resmi PM.
							</p>
						</div>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<div className="space-y-1">
								<label
									htmlFor="fb-target"
									className="block font-medium text-text-secondary text-xs"
								>
									Anggota SR
								</label>
								<Select
									id="fb-target"
									value={fbTargetUserId}
									onChange={(event) => setFbTargetUserId(event.target.value)}
								>
									<option value="">Pilih anggota SR…</option>
									{rosterOptions.map((opt) => (
										<option key={opt.userId} value={opt.userId}>
											{opt.label}
										</option>
									))}
								</Select>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="fb-type"
									className="block font-medium text-text-secondary text-xs"
								>
									Kategori Kegiatan
								</label>
								<Select
									id="fb-type"
									value={fbActivityType}
									onChange={(event) =>
										setFbActivityType(
											event.target.value as z.infer<
												typeof attendanceActivityTypeSchema
											>,
										)
									}
								>
									{activityTypeOptions.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</Select>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="fb-status"
									className="block font-medium text-text-secondary text-xs"
								>
									Status Kehadiran
								</label>
								<Select
									id="fb-status"
									value={fbStatus}
									onChange={(event) =>
										setFbStatus(
											event.target.value as z.infer<
												typeof attendanceFallbackStatusSchema
											>,
										)
									}
								>
									{attendanceStatusOptions.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</Select>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="fb-title"
									className="block font-medium text-text-secondary text-xs"
								>
									Judul Kegiatan
								</label>
								<Input
									id="fb-title"
									className="min-h-11"
									placeholder="Contoh: Rapat Koordinasi Bulanan"
									value={fbActivityTitle}
									onChange={(event) => setFbActivityTitle(event.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="fb-date"
									className="block font-medium text-text-secondary text-xs"
								>
									Tanggal Kegiatan
								</label>
								<Input
									id="fb-date"
									type="date"
									className="min-h-11"
									value={fbActivityDate}
									onChange={(event) => setFbActivityDate(event.target.value)}
								/>
							</div>
							<div className="flex items-end">
								<p className="w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-text-secondary text-xs">
									Estimasi poin:{" "}
									<strong className="text-foreground">
										{fallbackPreview.earnedPoints}
									</strong>{" "}
									/ {fallbackPreview.maxPoints}
								</p>
							</div>
						</div>
						<div className="space-y-1">
							<label
								htmlFor="fb-notes"
								className="block font-medium text-text-secondary text-xs"
							>
								Alasan Fallback (Wajib)
							</label>
							<Textarea
								id="fb-notes"
								placeholder="Jelaskan mengapa presensi tidak tersedia pada log QR Attendance RESORA"
								value={fbNotes}
								onChange={(event) => setFbNotes(event.target.value)}
							/>
						</div>
						<Button
							type="button"
							className="min-h-11"
							disabled={
								!fbTargetUserId ||
								!fbActivityTitle.trim() ||
								!fbNotes.trim() ||
								recordFallback.isPending
							}
							onClick={() =>
								recordFallback.mutate({
									evaluationPeriodId,
									targetUserId: fbTargetUserId,
									activityType: fbActivityType,
									activityTitle: fbActivityTitle.trim(),
									activityDate: fbActivityDate,
									attendanceStatus: fbStatus,
									sourceKind: "MANUAL_FALLBACK",
									notes: fbNotes.trim(),
								})
							}
						>
							Simpan Kehadiran Fallback
						</Button>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardContent className="space-y-4 p-5">
					<div>
						<h2 className="font-bold text-base text-foreground">
							Transaksi Poin Tambahan & Pengurangan
						</h2>
						<p className="text-muted-foreground text-xs">
							Kadep atau SUPERADMIN mengajukan transaksi poin; HCO atau Inti
							memverifikasi sebelum dihitung pada rekap.
						</p>
					</div>

					{canProposePoints && periodStatus !== "FINAL" && (
						<div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
							<h3 className="font-bold text-foreground text-sm">
								Ajukan Poin Baru
							</h3>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<div className="space-y-1">
									<label
										htmlFor="tx-target"
										className="block font-medium text-text-secondary text-xs"
									>
										Anggota SR
									</label>
									{rosterOptions.length > 0 ? (
										<Select
											id="tx-target"
											value={txTargetUserId}
											onChange={(event) =>
												setTxTargetUserId(event.target.value)
											}
										>
											<option value="">Pilih anggota SR…</option>
											{rosterOptions.map((opt) => (
												<option key={opt.userId} value={opt.userId}>
													{opt.label}
												</option>
											))}
										</Select>
									) : (
										<Input
											id="tx-target"
											className="min-h-11"
											placeholder="User ID SR"
											value={txTargetUserId}
											onChange={(event) =>
												setTxTargetUserId(event.target.value)
											}
										/>
									)}
								</div>
								<div className="space-y-1">
									<label
										htmlFor="tx-type"
										className="block font-medium text-text-secondary text-xs"
									>
										Jenis Transaksi
									</label>
									<Select
										id="tx-type"
										value={txType}
										onChange={(event) =>
											setTxType(event.target.value as "ADDITION" | "DEDUCTION")
										}
									>
										<option value="ADDITION">Penambahan Poin (+)</option>
										<option value="DEDUCTION">Pengurangan Poin (-)</option>
									</Select>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="tx-points"
										className="block font-medium text-text-secondary text-xs"
									>
										Jumlah Poin
									</label>
									<Input
										id="tx-points"
										type="number"
										min={0.5}
										max={1000}
										step={0.5}
										className="min-h-11"
										value={txPoints}
										onChange={(event) => setTxPoints(event.target.value)}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="tx-date"
										className="block font-medium text-text-secondary text-xs"
									>
										Tanggal Kejadian
									</label>
									<Input
										id="tx-date"
										type="date"
										className="min-h-11"
										value={txOccurredOn}
										onChange={(event) => setTxOccurredOn(event.target.value)}
									/>
								</div>
							</div>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<div className="space-y-1">
									<label
										htmlFor="tx-category"
										className="block font-medium text-text-secondary text-xs"
									>
										Kategori / Jenis Penghargaan atau Pelanggaran
									</label>
									<Input
										id="tx-category"
										className="min-h-11"
										placeholder="Contoh: Inisiatif Tambahan / Keterlambatan Jadwal"
										value={txCategory}
										onChange={(event) => setTxCategory(event.target.value)}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="tx-reason"
										className="block font-medium text-text-secondary text-xs"
									>
										Justifikasi
									</label>
									<Input
										id="tx-reason"
										className="min-h-11"
										placeholder="Ringkasan bukti atau konteks pengajuan"
										value={txReason}
										onChange={(event) => setTxReason(event.target.value)}
									/>
								</div>
							</div>
							<Button
								type="button"
								className="min-h-11"
								disabled={
									!txTargetUserId.trim() ||
									!txCategory.trim() ||
									!txReason.trim() ||
									!(Number(txPoints) > 0) ||
									proposeTx.isPending
								}
								onClick={() =>
									proposeTx.mutate({
										evaluationPeriodId,
										targetUserId: txTargetUserId.trim(),
										transactionType: txType,
										points: Number(txPoints),
										category: txCategory.trim(),
										reason: txReason.trim(),
										occurredOn: txOccurredOn,
									})
								}
							>
								Kirim Usulan Poin
							</Button>
						</div>
					)}

					{!canLoadTransactions ? (
						<p role="status" className="text-muted-foreground text-sm">
							Riwayat transaksi poinmu yang disetujui dapat dilihat setelah
							periode difinalisasi.
						</p>
					) : transactionsQuery.isLoading ? (
						<p className="text-muted-foreground text-sm">
							Memuat transaksi poin…
						</p>
					) : transactionsQuery.error ? (
						<p role="alert" className="text-danger text-sm">
							{penilaianErrorMessage(transactionsQuery.error)}
						</p>
					) : !transactionsQuery.data?.transactions.length ? (
						<p role="status" className="text-muted-foreground text-sm">
							Belum ada transaksi poin tercatat pada periode ini.
						</p>
					) : (
						<div className="space-y-2.5">
							{transactionsQuery.data.transactions.map((tx) => (
								<div
									key={tx.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5"
								>
									<div className="min-w-0 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-semibold text-foreground text-sm">
												{tx.targetName ?? tx.targetUserId}
											</span>
											<span
												className={`rounded-full border px-2 py-0.5 font-bold text-[11px] ${penilaianStatusBadgeClass(tx.status)}`}
											>
												{transactionStatusLabels[tx.status] ?? tx.status}
											</span>
										</div>
										<p className="text-foreground text-xs">
											{tx.transactionType === "ADDITION" ? "+" : "-"}
											{formatPenilaianScore(tx.points)} poin · {tx.category}
										</p>
										<p className="text-muted-foreground text-xs">
											{tx.reason} · Diajukan oleh{" "}
											{tx.proposedByName ?? tx.proposedByUserId} (
											{tx.occurredOn})
										</p>
									</div>
									{canApprovePoints &&
										tx.status === "PENDING" &&
										periodStatus !== "FINAL" && (
											<div className="flex items-center gap-2">
												<Button
													type="button"
													size="sm"
													className="min-h-11"
													disabled={decideTx.isPending}
													onClick={() =>
														decideTx.mutate({
															evaluationPeriodId,
															transactionId: tx.id,
															decision: "APPROVED",
														})
													}
												>
													Setujui
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="min-h-11"
													disabled={decideTx.isPending}
													onClick={() =>
														decideTx.mutate({
															evaluationPeriodId,
															transactionId: tx.id,
															decision: "REJECTED",
														})
													}
												>
													Tolak
												</Button>
											</div>
										)}
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
