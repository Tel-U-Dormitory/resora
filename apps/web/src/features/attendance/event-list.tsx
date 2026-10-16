"use client";

import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { DeletedDraftHistory } from "./event-admin-history";
import { eventErrorMessage, formatEventTime, StatusBadge } from "./event-ui";

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
		<section className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<p className="font-semibold text-primary text-xs uppercase tracking-wider">
						RESORA / Event
					</p>
					<h1 className="font-bold text-2xl tracking-tight">
						{management ? "Kelola event internal" : "Event internal SR"}
					</h1>
					<p className="text-muted-foreground text-sm">
						{management
							? "Kelola jadwal, undangan peserta, dan QR event internal."
							: "Jadwal dan informasi event terpublikasi yang dapat Anda lihat."}
					</p>
				</div>
				{management && (
					<Link
						href="/events/new"
						className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm hover:bg-primary-hover"
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
					<Card>
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
			<div className="grid gap-4 md:grid-cols-2">
				{!query.error &&
					!query.isPlaceholderData &&
					events.map((event) => (
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
									<div className="flex shrink-0 flex-col items-end gap-2">
										<StatusBadge status={event.status} />
										{event.visibility !== "VISIBLE" && (
											<StatusBadge status={event.visibility} />
										)}
									</div>
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
			{management && query.data?.isSuperadmin && <DeletedDraftHistory />}
		</section>
	);
}
