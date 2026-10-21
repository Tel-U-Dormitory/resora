"use client";

import { Card, CardContent } from "@resora/ui/components/card";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { DeletedDraftHistory } from "./event-admin-history";
import {
	eventErrorMessage,
	formatEventSchedule,
	StatusBadge,
} from "./event-ui";

const visibilityFilters = [
	["NON_ARCHIVED", "Semua nonarsip"],
	["VISIBLE", "Ditampilkan"],
	["HIDDEN", "Disembunyikan"],
	["ARCHIVED", "Diarsipkan"],
] as const;

export default function EventList() {
	const params = useSearchParams();
	const [visibility, setVisibility] =
		useState<(typeof visibilityFilters)[number][0]>("NON_ARCHIVED");
	const query = useQuery({
		...trpc.attendance.list.queryOptions({
			visibility: params.get("view") === "manage" ? visibility : "NON_ARCHIVED",
		}),
		placeholderData: (previous) => previous,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const management = query.data?.canManage && params.get("view") === "manage";
	const events =
		query.data?.events.filter(
			(event) =>
				management ||
				(event.status === "PUBLISHED" && event.visibility === "VISIBLE"),
		) ?? [];
	return (
		<section className="resora-page space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="font-bold text-2xl tracking-tight">
						{management ? "Kelola event internal" : "Event internal SR"}
					</h1>
					<p className="text-muted-foreground text-sm">
						{management
							? "Atur kegiatan dan kehadiran Senior Resident."
							: "Kegiatan yang mengundang Anda."}
					</p>
				</div>
				{management && (
					<Link
						href="/events/new"
						className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm hover:bg-primary-hover sm:w-auto"
					>
						<Plus size={18} aria-hidden="true" />
						Buat event
					</Link>
				)}
			</div>
			{management && query.data?.isSuperadmin && (
				<label
					htmlFor="event-visibility"
					className="block max-w-xs space-y-2 text-sm"
				>
					Visibilitas event
					<Select
						id="event-visibility"
						value={visibility}
						disabled={query.isFetching}
						onChange={(event) =>
							setVisibility(event.target.value as typeof visibility)
						}
					>
						{visibilityFilters.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</Select>
				</label>
			)}
			{(query.isPending || query.isPlaceholderData) && (
				<div role="status" className="grid gap-3">
					<span className="sr-only">Memuat event…</span>
					{[1, 2, 3, 4].map((id) => (
						<Skeleton key={id} className="h-48 w-full rounded-xl" />
					))}
				</div>
			)}
			{query.error && (
				<Card className="resora-panel">
					<CardContent className="space-y-4">
						<p role="alert" className="text-destructive text-sm">
							{eventErrorMessage(query.error)}
						</p>
						<div className="flex flex-wrap items-center gap-4">
							<Button
								variant="outline"
								disabled={query.isFetching}
								loading={query.isFetching}
								onClick={() => query.refetch()}
							>
								{query.isFetching ? "Memuat event…" : "Coba kembali"}
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
			{query.data &&
				!query.error &&
				!query.isPlaceholderData &&
				events.length === 0 && (
					<Card className="resora-panel">
						<CardContent className="flex flex-col items-center gap-3 py-12 text-center">
							<span className="rounded-2xl bg-primary-soft p-4 text-primary">
								<CalendarDays size={28} aria-hidden="true" />
							</span>
							<h2 className="font-semibold text-lg">Belum ada event</h2>
							<p className="max-w-md text-muted-foreground text-sm">
								{management && visibility !== "NON_ARCHIVED"
									? "Tidak ada event yang sesuai dengan filter visibilitas ini."
									: management
										? "Mulai dengan membuat draft event, lalu pilih peserta yang ingin diundang."
										: "Event akan muncul di sini setelah Anda menerima undangan."}
							</p>
						</CardContent>
					</Card>
				)}
			{!query.error && !query.isPlaceholderData && events.length > 0 && (
				<Card className="resora-panel gap-0 py-0" aria-busy={query.isFetching}>
					<div className="hidden grid-cols-[minmax(0,1fr)_180px_140px] items-center gap-6 border-border border-b bg-muted/30 px-6 py-3 font-medium text-muted-foreground text-xs lg:grid">
						<span>Kegiatan & jadwal</span>
						<span>Status</span>
						<span className="text-right">Detail kegiatan</span>
					</div>
					<CardContent className="divide-y divide-border px-4 sm:px-6">
						{events.map((event) => (
							<article
								key={event.id}
								className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-4 py-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_180px_140px] lg:items-center lg:gap-6"
							>
								<div className="min-w-0 space-y-2.5">
									<h2 className="break-words font-semibold text-base leading-snug">
										<Link
											className="focus-ring rounded-md transition-colors hover:text-primary"
											href={`/events/${event.id}`}
										>
											{event.title}
										</Link>
									</h2>
									<p className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed sm:text-sm">
										<CalendarDays
											className="mt-0.5 size-4 shrink-0"
											aria-hidden="true"
										/>
										<span>
											{formatEventSchedule(event.startsAt, event.endsAt)}
										</span>
									</p>
								</div>
								<div className="flex max-w-36 flex-col items-end gap-2 self-start lg:max-w-none lg:items-start lg:self-center">
									<StatusBadge status={event.status} />
									{event.visibility !== "VISIBLE" && (
										<StatusBadge status={event.visibility} />
									)}
								</div>
								<Link
									className="focus-ring col-span-2 inline-flex min-h-11 items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 font-medium text-sm transition-colors hover:bg-muted lg:col-span-1"
									href={`/events/${event.id}`}
									aria-label={`Lihat detail ${event.title}`}
								>
									Lihat detail
									<ArrowRight size={16} data-action-arrow aria-hidden="true" />
								</Link>
							</article>
						))}
					</CardContent>
				</Card>
			)}

			{management && query.data?.isSuperadmin && <DeletedDraftHistory />}
		</section>
	);
}
