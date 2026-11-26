"use client";

import { Card, CardContent } from "@resora/ui/components/card";
import { Skeleton } from "@resora/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
	CalendarDays,
	CheckCheck,
	ChevronLeft,
	ChevronRight,
	Clock3,
} from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getPersonalTrpc } from "@/utils/trpc";
import {
	eventErrorMessage,
	formatEventSchedule,
	StatusBadge,
} from "../../components/event-feedback";

const checkInFormatter = new Intl.DateTimeFormat("id-ID", {
	timeStyle: "short",
	timeZone: "Asia/Jakarta",
});
const checkInDateFormatter = new Intl.DateTimeFormat("id-ID", {
	dateStyle: "medium",
	timeZone: "Asia/Jakarta",
});

export default function OwnHistory({ userId }: { userId: string }) {
	const [offset, setOffset] = useState(0);
	const options = getPersonalTrpc(userId).attendance.ownHistory.queryOptions({
		offset,
		limit: 25,
	});
	const history = useQuery({
		...options,
		retry: false,
		staleTime: 0,
		refetchOnMount: "always",
		placeholderData: undefined,
		meta: {
			errorHandledLocally: true,
			personalResource: "attendance.ownHistory",
		},
	});
	return (
		<section className="resora-page resora-history space-y-4 sm:space-y-5">
			<div className="space-y-1">
				<h1 className="font-bold text-xl tracking-tight sm:text-2xl">
					Riwayat kehadiran
				</h1>
				<p className="hidden text-muted-foreground text-sm sm:block">
					Lihat status dan waktu kehadiran kamu di setiap kegiatan.
				</p>
			</div>
			{history.fetchStatus === "paused" && (
				<p role="status">
					Koneksi terputus. Riwayat yang sudah dimuat bisa belum terbaru.
					Sambungkan internet untuk memperbarui.
				</p>
			)}
			{history.isPending && (
				<div role="status" className="space-y-3">
					<span className="sr-only">Memuat riwayat…</span>
					{[1, 2, 3].map((id) => (
						<Skeleton key={id} className="h-28 rounded-2xl" />
					))}
				</div>
			)}
			{history.error && (
				<div className="space-y-3">
					<p role="alert">{eventErrorMessage(history.error)}</p>
					<Button variant="outline" onClick={() => history.refetch()}>
						Coba kembali
					</Button>
				</div>
			)}
			{!history.error && history.data?.items.length === 0 && (
				<Card className="resora-panel py-0">
					<CardContent className="p-2">
						<EmptyState
							variant="history"
							title="Belum ada riwayat kegiatan"
							description="Kegiatan yang mengundang kamu akan tampil di sini beserta status kehadirannya."
						/>
					</CardContent>
				</Card>
			)}
			{!history.error && Boolean(history.data?.items.length) && (
				<div
					className="space-y-2.5 sm:space-y-3"
					aria-busy={history.isFetching}
				>
					{history.data?.items.map((item) => (
						<Card key={item.event.id} className="resora-panel py-0">
							<CardContent className="p-3.5 sm:p-4">
								<article className="space-y-2.5">
									<div className="flex items-start justify-between gap-2.5 sm:gap-4">
										<div className="min-w-0 flex-1 space-y-1">
											<h2 className="truncate font-semibold text-foreground text-sm leading-snug sm:text-base">
												{item.event.title}
											</h2>
											<p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
												<CalendarDays
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
												<span className="truncate">
													{formatEventSchedule(
														item.event.startsAt,
														item.event.endsAt,
													)}
												</span>
											</p>
										</div>
										<div className="resora-history-status shrink-0">
											<StatusBadge status={item.presence} />
										</div>
									</div>

									<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-xs">
										<div className="flex min-w-0 items-center gap-2">
											{item.attendanceAt ? (
												<CheckCheck
													className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
													aria-hidden="true"
												/>
											) : (
												<Clock3
													className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
													aria-hidden="true"
												/>
											)}
											<p className="truncate text-foreground">
												{item.attendanceAt ? (
													<>
														<span className="text-muted-foreground">
															Check-in{" "}
														</span>
														<time
															dateTime={item.attendanceAt}
															className="font-semibold tabular-nums"
														>
															{checkInFormatter.format(
																new Date(item.attendanceAt),
															)}
														</time>
														<span className="text-muted-foreground">
															{" "}
															WIB ·{" "}
															{checkInDateFormatter.format(
																new Date(item.attendanceAt),
															)}
														</span>
													</>
												) : (
													<span className="font-medium text-amber-600 dark:text-amber-400">
														Check-in Belum tercatat
													</span>
												)}
											</p>
										</div>
										{item.timingClass && (
											<span
												className={`shrink-0 font-medium ${item.timingClass === "LATE" ? "text-warning" : "text-muted-foreground"}`}
											>
												{item.timingClass === "LATE"
													? item.lateMinutes == null
														? "Terlambat"
														: `Terlambat ${item.lateMinutes} mnt`
													: item.timingClass === "EARLY"
														? "Datang lebih awal"
														: "Tepat waktu"}
											</span>
										)}
									</div>

									<details className="group border-border border-t pt-2 text-xs">
										<summary className="focus-ring flex w-full cursor-pointer list-none items-center justify-between rounded-md py-1 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
											<span>Detail kehadiran</span>
											<ChevronLeft
												size={16}
												aria-hidden="true"
												className="shrink-0 transition-transform duration-150 group-open:-rotate-90"
											/>
										</summary>
										<dl className="mt-2 grid grid-cols-2 gap-3 text-xs sm:max-w-md">
											<div>
												<dt className="text-muted-foreground">
													Status kegiatan
												</dt>
												<dd className="mt-1">
													<StatusBadge status={item.event.status} />
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">
													Metode pencatatan
												</dt>
												<dd className="mt-1 font-medium text-foreground">
													{item.source === "QR"
														? "Scan QR"
														: item.source === "MANUAL"
															? "Dicatat manual"
															: "Belum tercatat"}
												</dd>
											</div>
										</dl>
									</details>
								</article>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{!history.error &&
				!history.isPending &&
				(offset > 0 || history.data?.nextOffset != null) && (
					<nav
						aria-label="Halaman riwayat"
						className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-4"
					>
						<p className="text-muted-foreground text-sm">
							Halaman {Math.floor(offset / 25) + 1}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								disabled={offset === 0 || history.isFetching}
								onClick={() => setOffset(Math.max(0, offset - 25))}
							>
								<ChevronLeft size={16} aria-hidden="true" /> Sebelumnya
							</Button>
							<Button
								variant="outline"
								disabled={
									history.data?.nextOffset == null || history.isFetching
								}
								onClick={() => {
									if (history.data?.nextOffset != null)
										setOffset(history.data.nextOffset);
								}}
							>
								Berikutnya <ChevronRight size={16} aria-hidden="true" />
							</Button>
						</div>
					</nav>
				)}
		</section>
	);
}
