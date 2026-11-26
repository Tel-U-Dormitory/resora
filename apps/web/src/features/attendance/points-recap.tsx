"use client";

import {
	pointsCellValue,
	pointsEventHeading,
	pointsSummaryLabels,
	pointsSummaryValues,
} from "@resora/api/modules/attendance/points.contracts";
import { Checkbox } from "@resora/ui/components/checkbox";
import { Input } from "@resora/ui/components/input";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { eventErrorMessage } from "@/components/event-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { participantPage } from "@/utils/participant-page";
import { trpc, trpcClient } from "@/utils/trpc";

const numbers = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const identityColumns = [
	"NIM",
	"Nama",
	"Departemen (saat ini)",
	"Gedung (saat ini)",
];

export default function PointsRecap() {
	const [periodId, setPeriodId] = useState("");
	const [search, setSearch] = useState("");
	const [appliedEventIds, setAppliedEventIds] = useState<string[] | undefined>(
		undefined,
	);
	// null means the server-defined default selection; [] deliberately selects nothing.
	const [draftEventIds, setDraftEventIds] = useState<string[] | null>(null);
	const [showArchived, setShowArchived] = useState(false);
	const [page, setPage] = useState(1);
	const [exporting, setExporting] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");
	const [mobileView, setMobileView] = useState<"cards" | "matrix">("cards");
	const exportLock = useRef(false);
	const periods = useQuery({
		...trpc.attendance.pointsPeriods.queryOptions(),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const recap = useQuery({
		...trpc.attendance.pointsRecap.queryOptions({
			periodId,
			...(appliedEventIds === undefined
				? {}
				: { selectedEventIds: appliedEventIds }),
		}),
		enabled: Boolean(periodId),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const report =
		!recap.error &&
		recap.data?.period.id === periodId &&
		(appliedEventIds === undefined ||
			JSON.stringify([...appliedEventIds].sort()) ===
				JSON.stringify(recap.data.events.map((event) => event.eventId).sort()))
			? recap.data
			: undefined;
	const availableEvents =
		recap.data?.period.id === periodId ? recap.data.availableEvents : [];
	const draftIds =
		draftEventIds ??
		availableEvents
			.filter((event) => event.visibility !== "ARCHIVED")
			.map((event) => event.eventId);
	const selectedIds = new Set(draftIds);
	const appliedIds =
		report?.events.map((event) => event.eventId) ?? appliedEventIds ?? [];
	const unapplied =
		JSON.stringify([...draftIds].sort()) !==
		JSON.stringify([...appliedIds].sort());
	const visible = participantPage(
		(report?.participants ?? []).map((row) => ({ ...row, nim: row.nim ?? "" })),
		search,
		page,
	);
	const partial = report?.participants.some(
		(row) => row.scoringStatus === "PARTIAL",
	);
	return (
		<section className="resora-page resora-events resora-points min-w-0 space-y-6">
			<div className="space-y-2">
				<Link
					href="/events?view=manage"
					className="focus-ring rounded-md text-primary text-sm underline"
				>
					Kembali ke kelola event
				</Link>
				<h1 className="font-bold text-2xl tracking-tight">
					Rekap Poin Kehadiran SR
				</h1>
				<p className="hidden text-muted-foreground text-sm sm:block">
					Rekap akumulasi poin kehadiran berdasarkan kegiatan yang telah
					selesai.
				</p>
			</div>
			{periods.isPending && <p role="status">Memuat periode SR…</p>}
			{periods.error && (
				<div role="alert" className="space-y-3">
					<p>{eventErrorMessage(periods.error)}</p>
					<Button
						variant="outline"
						disabled={periods.isFetching}
						onClick={() => periods.refetch()}
					>
						Coba kembali
					</Button>
				</div>
			)}
			{!periods.isPending && !periods.error && periods.data?.length === 0 && (
				<p>Belum ada periode SR yang dikonfigurasi.</p>
			)}
			{!periods.error && Boolean(periods.data?.length) && (
				<>
					<Card>
						<CardContent className="flex flex-wrap items-end gap-4">
							<label
								htmlFor="points-period"
								className="min-w-0 flex-1 space-y-2 text-sm"
							>
								Periode SR
								<Select
									id="points-period"
									value={periodId}
									disabled={exporting}
									onChange={(event) => {
										if (exportLock.current) return;
										setPeriodId(event.target.value);
										setAppliedEventIds(undefined);
										setDraftEventIds(null);
										setShowArchived(false);
										setSearch("");
										setPage(1);
										setError("");
										setFeedback("");
									}}
								>
									<option value="">Pilih periode SR</option>
									{periods.data?.map((period) => (
										<option key={period.periodId} value={period.periodId}>
											{period.name} ({period.startsOn} – {period.endsOn})
										</option>
									))}
								</Select>
							</label>
							<Button
								variant="outline"
								disabled={!periodId || recap.isFetching || exporting}
								onClick={() => recap.refetch()}
							>
								Perbarui rekap
							</Button>
							<Button
								disabled={!report || recap.isFetching || exporting}
								loading={exporting}
								onClick={async () => {
									if (exportLock.current || !periodId || !report) return;
									exportLock.current = true;
									setExporting(true);
									setError("");
									setFeedback("");
									let url: string | undefined;
									try {
										const csv =
											await trpcClient.attendance.exportPointsCsv.query({
												periodId,
												selectedEventIds: report.events.map(
													(event) => event.eventId,
												),
											});
										url = URL.createObjectURL(
											new Blob([csv.content], {
												type: "text/csv;charset=utf-8",
											}),
										);
										const link = document.createElement("a");
										link.href = url;
										link.download = csv.filename;
										document.body.appendChild(link);
										try {
											link.click();
										} finally {
											link.remove();
										}
										setFeedback(
											"CSV seluruh anggota periode disiapkan untuk diunduh.",
										);
									} catch (cause) {
										setError(eventErrorMessage(cause));
									} finally {
										if (url) URL.revokeObjectURL(url);
										exportLock.current = false;
										setExporting(false);
									}
								}}
							>
								{exporting ? "Menyiapkan CSV…" : "Export CSV Semua SR"}
							</Button>
						</CardContent>
					</Card>
					{periodId && (
						<Card>
							<CardContent className="space-y-4">
								<fieldset className="min-w-0 space-y-3" disabled={exporting}>
									<legend className="font-semibold">
										Filter Event Penilaian
									</legend>
									<label
										className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
										htmlFor="points-show-archived"
									>
										<Checkbox
											id="points-show-archived"
											checked={showArchived}
											onCheckedChange={(checked) => setShowArchived(checked)}
										/>
										Tampilkan event yang diarsipkan
									</label>
									<div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
										{availableEvents
											.filter(
												(event) =>
													showArchived || event.visibility !== "ARCHIVED",
											)
											.map((event) => (
												<label
													key={event.eventId}
													htmlFor={`points-event-${event.eventId}`}
													className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 text-sm hover:bg-muted"
												>
													<Checkbox
														id={`points-event-${event.eventId}`}
														checked={selectedIds.has(event.eventId)}
														onCheckedChange={(checked) =>
															setDraftEventIds(
																checked
																	? [...new Set([...draftIds, event.eventId])]
																	: draftIds.filter(
																			(id) => id !== event.eventId,
																		),
															)
														}
													/>
													<span className="min-w-0 break-words">
														<span className="block">
															{pointsEventHeading(event)}
														</span>
														<span className="text-muted-foreground text-xs">
															{event.scoringMode === null
																? "Belum diklasifikasikan"
																: "Masukkan dalam penilaian"}
															{event.visibility === "ARCHIVED"
																? " - Diarsipkan"
																: ""}
														</span>
													</span>
												</label>
											))}
										{availableEvents.length === 0 && (
											<p className="p-2 text-muted-foreground text-sm">
												{recap.isFetching
													? "Memuat pilihan event..."
													: recap.error
														? "Pilihan event belum dapat dimuat. Reset default lalu terapkan kembali."
														: "Tidak ada event yang memenuhi syarat pada periode ini."}
											</p>
										)}
									</div>
									<p role="status" className="text-muted-foreground text-sm">
										{draftIds.length} event dipilih.{" "}
										{unapplied
											? "Pilihan belum diterapkan; matrix dan CSV masih memakai filter yang diterapkan."
											: "Pilihan sesuai dengan rekap."}
									</p>
									<div className="flex flex-wrap gap-2">
										<Button
											variant="outline"
											onClick={() => setDraftEventIds(null)}
											disabled={exporting}
										>
											Reset default
										</Button>
										<Button
											variant="outline"
											onClick={() => setDraftEventIds([])}
											disabled={exporting}
										>
											Kosongkan
										</Button>
										<Button
											disabled={exporting || recap.isFetching}
											onClick={() => {
												if (exportLock.current) return;
												const nextIds =
													draftEventIds === null
														? undefined
														: [...draftEventIds].sort();
												if (
													JSON.stringify(nextIds) ===
													JSON.stringify(appliedEventIds)
												)
													void recap.refetch();
												setAppliedEventIds(nextIds);
												setPage(1);
												setFeedback("");
												setError("");
											}}
										>
											Terapkan Filter
										</Button>
									</div>
								</fieldset>
							</CardContent>
						</Card>
					)}
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					{feedback && (
						<p role="status" className="text-sm text-success">
							{feedback}
						</p>
					)}
					{periodId && recap.isPending && (
						<p role="status">Memuat rekap poin…</p>
					)}
					{periodId && recap.error && (
						<div role="alert" className="space-y-3">
							<p>{eventErrorMessage(recap.error)}</p>
							<Button
								variant="outline"
								disabled={recap.isFetching}
								onClick={() => recap.refetch()}
							>
								Coba muat rekap kembali
							</Button>
						</div>
					)}
					{report && (
						<>
							<div className="space-y-2 text-sm">
								<p>
									{report.participants.length} SR ·{" "}
									{
										report.events.filter(
											(event) => event.scoringMode === "INCLUDED",
										).length
									}{" "}
									event dinilai ·{" "}
									{
										report.events.filter((event) => event.scoringMode === null)
											.length
									}{" "}
									event belum dinilai.
								</p>
								<p className="text-muted-foreground">
									Departemen dan gedung adalah data saat ini, bukan riwayat
									penugasan pada periode ini. Undangan dan penilaian memakai
									snapshot masing-masing event.
								</p>
								{partial && (
									<p
										role="status"
										className="rounded-lg border border-warning/30 bg-warning/10 p-3"
									>
										Rekap belum lengkap. Total poin hanya mencakup skor yang
										diketahui dan belum merupakan penilaian final.
									</p>
								)}
								{report.events.length === 0 && (
									<p>
										{appliedEventIds?.length === 0
											? "Tidak ada event dipilih."
											: "Belum ada event CLOSED yang memenuhi filter pada periode ini."}{" "}
										Angka nol menunjukkan tidak ada event yang dihitung, bukan
										penilaian final.
									</p>
								)}
							</div>
							{report.participants.length === 0 ? (
								<p>Belum ada anggota SR pada periode ini.</p>
							) : (
								<>
									<label
										htmlFor="points-search"
										className="block max-w-sm space-y-2 text-sm"
									>
										Cari NIM atau nama
										<Input
											id="points-search"
											value={search}
											onChange={(event) => {
												setSearch(event.target.value);
												setPage(1);
											}}
										/>
									</label>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<p className="text-muted-foreground text-sm">
											{visible.matching} hasil dari {report.participants.length}{" "}
											SR. CSV selalu mencakup seluruh anggota periode. Geser
											tabel untuk melihat semua event.
										</p>
										<fieldset className="inline-flex rounded-xl border border-border bg-surface-subtle p-1 min-[1200px]:hidden">
											<legend className="sr-only">Mode tampilan rekap</legend>
											<button
												type="button"
												onClick={() => setMobileView("cards")}
												aria-pressed={mobileView === "cards"}
												className={`min-h-9 rounded-lg px-3 font-semibold text-xs ${
													mobileView === "cards"
														? "bg-primary text-white"
														: "text-text-secondary"
												}`}
											>
												Ringkasan Kartu
											</button>
											<button
												type="button"
												onClick={() => setMobileView("matrix")}
												aria-pressed={mobileView === "matrix"}
												className={`min-h-9 rounded-lg px-3 font-semibold text-xs ${
													mobileView === "matrix"
														? "bg-primary text-white"
														: "text-text-secondary"
												}`}
											>
												Tabel Matriks
											</button>
										</fieldset>
									</div>
									<section
										aria-label="Ringkasan poin per SR"
										className={`resora-points-cards grid gap-3 ${mobileView === "matrix" ? "hidden" : ""}`}
									>
										{visible.rows.map((row) => (
											<article
												key={row.userId}
												className="rounded-2xl border border-border bg-surface p-4"
											>
												<h2 className="font-semibold text-base">{row.name}</h2>
												<p className="text-muted-foreground text-sm">
													NIM: {row.nim || "—"} · {row.currentDepartmentCode}
												</p>
												<dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
													{pointsSummaryValues(
														row,
														report.events.length > 0,
													).map((value, index) => (
														<div key={pointsSummaryLabels[index]}>
															<dt className="text-muted-foreground">
																{pointsSummaryLabels[index]}
															</dt>
															<dd className="mt-1 font-semibold tabular-nums">
																{typeof value === "number"
																	? numbers.format(value)
																	: value}
															</dd>
														</div>
													))}
												</dl>
											</article>
										))}
									</section>

									<section
										aria-label="Matriks poin kehadiran SR"
										// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard access is required for horizontal scrolling.
										tabIndex={0}
										className={`focus-ring overflow-x-auto rounded-xl border border-border ${mobileView === "cards" ? "hidden min-[1200px]:block" : ""}`}
									>
										<table className="w-max min-w-full border-collapse text-left text-sm">
											<caption className="sr-only">
												Rekap {report.period.name}; — berarti tidak diundang, 0
												berarti tidak hadir pada event yang dinilai.
											</caption>
											<thead className="bg-muted">
												<tr>
													{identityColumns.map((column) => (
														<th
															key={column}
															scope="col"
															className="min-w-28 whitespace-normal border-border border-b p-3 align-top"
														>
															{column}
														</th>
													))}
													{report.events.map((event) => (
														<th
															key={event.eventId}
															scope="col"
															className="min-w-52 max-w-60 whitespace-normal break-words border-border border-b p-3 align-top"
														>
															{pointsEventHeading(event)}
														</th>
													))}
													{pointsSummaryLabels.map((label) => (
														<th
															key={label}
															scope="col"
															className="min-w-28 whitespace-normal border-border border-b p-3 align-top"
														>
															{label}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{visible.rows.map((row) => (
													<tr
														key={row.userId}
														className="border-border border-b last:border-b-0"
													>
														<th
															scope="row"
															className="whitespace-nowrap p-3 font-medium"
														>
															{row.nim || "—"}
														</th>
														<td className="min-w-40 p-3">{row.name}</td>
														<td className="p-3">{row.currentDepartmentCode}</td>
														<td className="min-w-36 p-3">
															{row.currentBuildingName ??
																row.currentBuildingCode ??
																"—"}
														</td>
														{row.events.map((cell) => {
															const value = pointsCellValue(cell);
															return (
																<td
																	key={cell.eventId}
																	className="p-3 tabular-nums"
																>
																	{typeof value === "number"
																		? numbers.format(value)
																		: value}
																</td>
															);
														})}
														{pointsSummaryValues(
															row,
															report.events.length > 0,
														).map((value, index) => (
															<td
																key={pointsSummaryLabels[index]}
																className={`p-3 tabular-nums ${row.scoringStatus === "PARTIAL" ? "text-warning" : ""}`}
															>
																{typeof value === "number"
																	? numbers.format(value)
																	: value}
															</td>
														))}
													</tr>
												))}
												{visible.matching === 0 && (
													<tr>
														<td
															colSpan={11 + report.events.length}
															className="p-6 text-center"
														>
															Tidak ada SR yang sesuai pencarian.
														</td>
													</tr>
												)}
											</tbody>
										</table>
									</section>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<p className="text-sm">
											Halaman {visible.page} dari {visible.pages}
										</p>
										<div className="flex gap-2">
											<Button
												variant="outline"
												disabled={visible.page <= 1}
												onClick={() => setPage(visible.page - 1)}
											>
												Sebelumnya
											</Button>
											<Button
												variant="outline"
												disabled={visible.page >= visible.pages}
												onClick={() => setPage(visible.page + 1)}
											>
												Berikutnya
											</Button>
										</div>
									</div>
								</>
							)}
						</>
					)}
				</>
			)}
		</section>
	);
}
