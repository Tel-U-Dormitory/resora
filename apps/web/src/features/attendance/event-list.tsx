"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { eventErrorMessage, formatEventTime, StatusBadge } from "./event-ui";

export default function EventList() {
	const query = useQuery({
		...trpc.attendance.list.queryOptions(),
		retry: false,
	});
	return (
		<section className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<p className="font-semibold text-primary text-xs uppercase tracking-wider">
						RESORA / Event
					</p>
					<h1 className="font-bold text-2xl tracking-tight">
						Event internal SR
					</h1>
					<p className="text-muted-foreground text-sm">
						{query.data?.canManage
							? "Kelola jadwal, undangan peserta, dan QR event internal."
							: "Jadwal dan informasi event yang mengundang Anda."}
					</p>
				</div>
				{query.data?.canManage && (
					<Link
						href="/events/new"
						className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm hover:bg-primary-hover"
					>
						<Plus size={18} aria-hidden="true" />
						Buat event
					</Link>
				)}
			</div>
			{query.isPending && (
				<div role="status" className="grid gap-4 md:grid-cols-2">
					<span className="sr-only">Memuat event…</span>
					{[1, 2, 3, 4].map((id) => (
						<Skeleton key={id} className="h-48 w-full rounded-xl" />
					))}
				</div>
			)}
			{query.error && (
				<Card>
					<CardContent className="space-y-4">
						<p role="alert" className="text-destructive text-sm">
							{eventErrorMessage(query.error)}
						</p>
						<div className="flex flex-wrap items-center gap-4">
							<Button variant="outline" onClick={() => query.refetch()}>
								Coba kembali
							</Button>
							<Link
								className="focus-ring rounded-md text-primary text-sm underline"
								href="/login?reason=session"
							>
								Periksa sesi
							</Link>
						</div>
					</CardContent>
				</Card>
			)}
			{query.data?.events.length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center gap-3 py-12 text-center">
						<span className="rounded-2xl bg-primary-soft p-4 text-primary">
							<CalendarDays size={28} aria-hidden="true" />
						</span>
						<h2 className="font-semibold text-lg">Belum ada event</h2>
						<p className="max-w-md text-muted-foreground text-sm">
							{query.data.canManage
								? "Mulai dengan membuat draft event, lalu pilih peserta yang ingin diundang."
								: "Event akan muncul di sini setelah Anda menerima undangan."}
						</p>
					</CardContent>
				</Card>
			)}
			<div className="grid gap-4 md:grid-cols-2">
				{query.data?.events.map((event) => (
					<Card key={event.id} className="flex flex-col">
						<CardContent className="flex flex-1 flex-col gap-4">
							<div className="flex items-start justify-between gap-3">
								<h2 className="min-w-0 break-words font-semibold text-lg">
									<Link
										className="focus-ring rounded-md hover:text-primary"
										href={`/events/${event.id}`}
									>
										{event.title}
									</Link>
								</h2>
								<StatusBadge status={event.status} />
							</div>
							<p className="line-clamp-2 text-muted-foreground text-sm">
								{event.description || "Belum ada deskripsi event."}
							</p>
							<div className="mt-auto flex items-start gap-2 text-muted-foreground text-sm">
								<CalendarDays
									size={17}
									className="mt-0.5 shrink-0"
									aria-hidden="true"
								/>
								<div>
									<p>{formatEventTime(event.startsAt)}</p>
									<p>sampai {formatEventTime(event.endsAt)}</p>
								</div>
							</div>
							<Link
								className="focus-ring inline-flex w-fit items-center gap-2 rounded-md font-semibold text-primary text-sm"
								href={`/events/${event.id}`}
							>
								Lihat detail
								<ArrowRight size={16} aria-hidden="true" />
							</Link>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}
