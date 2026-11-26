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
	History,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
		<section className="resora-page resora-history space-y-6">
			<Link
				href="/profile"
				className="focus-ring inline-flex min-h-11 items-center rounded-lg py-2 font-semibold text-primary text-sm"
			>
				Kembali ke profil
			</Link>
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">Riwayat kehadiran</h1>
				<p className="text-muted-foreground text-sm">
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
				<Card className="resora-panel">
					<CardContent className="space-y-2 py-10 text-center">
						<History
							className="mx-auto mb-4 size-8 text-muted-foreground"
							aria-hidden="true"
						/>
						<h2 className="font-semibold">Belum ada riwayat kegiatan</h2>
						<p className="text-muted-foreground text-sm">
							Kegiatan yang mengundang kamu akan tampil di sini beserta status
							kehadirannya.
						</p>
					</CardContent>
				</Card>
			)}
			{!history.error && Boolean(history.data?.items.length) && (
				<Card
					className="resora-panel gap-0 py-0"
					aria-busy={history.isFetching}
				>
					<CardContent className="divide-y divide-border px-4 sm:px-6">
						{history.data?.items.map((item) => (
							<article
								key={item.event.id}
								className="resora-history-row grid gap-4 py-5"
							>
								<div className="min-w-0 space-y-2.5">
									<h2 className="break-words font-semibold text-base leading-snug">
										{item.event.title}
									</h2>
									<p className="flex items-start gap-2 text-muted-foreground text-sm leading-relaxed sm:text-sm">
										<CalendarDays
											className="mt-0.5 size-4 shrink-0"
											aria-hidden="true"
										/>
										<span>
											{formatEventSchedule(
												item.event.startsAt,
												item.event.endsAt,
											)}
										</span>
									</p>
								</div>
								<div className="resora-history-status">
									<StatusBadge status={item.presence} />
								</div>
								<div className="resora-history-time flex items-start gap-3 rounded-xl bg-muted p-3">
									{item.attendanceAt ? (
										<CheckCheck
											className="mt-0.5 size-4 shrink-0 text-success"
											aria-hidden="true"
										/>
									) : (
										<Clock3
											className="mt-0.5 size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
									)}
									<div className="min-w-0 space-y-1">
										<p className="text-sm">
											<span className="text-muted-foreground">Check-in </span>
											{item.attendanceAt ? (
												<>
													<time
														dateTime={item.attendanceAt}
														className="font-semibold tabular-nums"
													>
														{checkInFormatter.format(
															new Date(item.attendanceAt),
														)}
													</time>
													<span className="text-muted-foreground"> WIB</span>
												</>
											) : (
												<span className="text-muted-foreground">
													Belum tercatat
												</span>
											)}
										</p>
										{item.attendanceAt && (
											<p className="text-muted-foreground text-sm">
												{checkInDateFormatter.format(
													new Date(item.attendanceAt),
												)}
											</p>
										)}
										{item.timingClass && (
											<p
												className={`text-sm ${item.timingClass === "LATE" ? "text-warning" : "text-muted-foreground"}`}
											>
												{item.timingClass === "LATE"
													? item.lateMinutes == null
														? "Terlambat; durasi belum tersedia"
														: `Terlambat ${item.lateMinutes} menit setelah toleransi`
													: item.timingClass === "EARLY"
														? "Datang lebih awal"
														: "Tepat waktu"}
											</p>
										)}
									</div>
								</div>
								<details className="resora-history-details border-border border-t pt-2">
									<summary className="focus-ring cursor-pointer rounded-lg py-2 font-semibold text-sm">
										Detail kehadiran
									</summary>
									<dl className="mt-2 grid gap-3 text-sm">
										<div>
											<dt className="text-muted-foreground">Status kegiatan</dt>
											<dd className="mt-1">
												<StatusBadge status={item.event.status} />
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground">
												Metode pencatatan
											</dt>
											<dd className="mt-1">
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
						))}
					</CardContent>
				</Card>
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
