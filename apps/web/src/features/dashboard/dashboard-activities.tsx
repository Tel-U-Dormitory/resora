"use client";

import { Card, CardContent } from "@resora/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import {
	eventErrorMessage,
	formatEventSchedule,
} from "@/components/event-feedback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import type { DashboardActivity } from "./dashboard.contracts";
import { useDashboardPreview } from "./dashboard-preview-context";

function ActivityCard({
	activity,
	href,
}: {
	activity: DashboardActivity;
	href?: `/events/${string}`;
}) {
	return (
		<Card className="resora-panel min-w-0">
			<CardContent className="flex min-h-32 flex-col gap-3 p-4 sm:p-5">
				<h3 className="break-words font-semibold leading-snug">
					{href ? (
						<Link
							className="focus-ring rounded-md hover:text-primary"
							href={href}
						>
							{activity.title}
						</Link>
					) : (
						activity.title
					)}
				</h3>
				<p className="flex items-start gap-2 text-muted-foreground text-sm">
					<CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					<span>{formatEventSchedule(activity.startsAt, activity.endsAt)}</span>
				</p>
			</CardContent>
		</Card>
	);
}

export function DashboardActivities() {
	const { fixture } = useDashboardPreview();
	const query = useQuery({
		...trpc.attendance.list.queryOptions({ visibility: "NON_ARCHIVED" }),
		enabled: !fixture,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const now = Date.now();
	const events =
		query.data?.events
			.filter(
				(event) =>
					event.status === "PUBLISHED" &&
					event.visibility === "VISIBLE" &&
					new Date(event.startsAt).getTime() >= now,
			)
			.sort(
				(first, second) =>
					new Date(first.startsAt).getTime() -
					new Date(second.startsAt).getTime(),
			)
			.slice(0, 5) ?? [];
	const fixtureActivities = fixture?.activities.slice(0, 5) ?? [];
	const forbidden = query.error?.data?.code === "FORBIDDEN";

	return (
		<section aria-labelledby="dashboard-activities-title" className="space-y-3">
			<div className="flex items-end justify-between gap-3">
				<h2 id="dashboard-activities-title" className="font-semibold text-lg">
					Kegiatan mendatang
				</h2>
				{!fixture && (
					<Link
						className="focus-ring inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-semibold text-primary text-sm"
						href="/events"
					>
						Semua kegiatan <ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				)}
			</div>
			{fixture ? (
				fixtureActivities.length ? (
					<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{fixtureActivities.map((activity) => (
							<ActivityCard key={activity.id} activity={activity} />
						))}
					</div>
				) : (
					<EmptyActivities />
				)
			) : query.isPending ? (
				<div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					<span className="sr-only">Memuat kegiatan…</span>
					{[1, 2, 3].map((item) => (
						<Skeleton key={item} className="h-32 w-full rounded-xl" />
					))}
				</div>
			) : query.error ? (
				<Card className="resora-panel">
					<CardContent className="space-y-3 p-4 sm:p-5">
						<p
							role={
								query.data && query.isRefetchError && !forbidden
									? "status"
									: "alert"
							}
							className={
								query.data && query.isRefetchError && !forbidden
									? "text-muted-foreground text-sm"
									: "text-destructive text-sm"
							}
						>
							{forbidden
								? "Akses ke daftar kegiatan ditolak."
								: query.data && query.isRefetchError
									? "Data kegiatan yang tersimpan ditampilkan; pembaruan gagal."
									: eventErrorMessage(query.error)}
						</p>
						{query.data &&
							query.isRefetchError &&
							!forbidden &&
							events.length > 0 && (
								<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
									{events.map((event) => (
										<ActivityCard
											key={event.id}
											activity={{
												id: event.id,
												title: event.title,
												startsAt: event.startsAt,
												endsAt: event.endsAt,
											}}
											href={`/events/${event.id}`}
										/>
									))}
								</div>
							)}
						<Button
							variant="outline"
							disabled={query.isFetching}
							onClick={() => void query.refetch()}
						>
							Coba kembali
						</Button>
					</CardContent>
				</Card>
			) : events.length ? (
				<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{events.map((event) => (
						<ActivityCard
							key={event.id}
							activity={{
								id: event.id,
								title: event.title,
								startsAt: event.startsAt,
								endsAt: event.endsAt,
							}}
							href={`/events/${event.id}`}
						/>
					))}
				</div>
			) : (
				<EmptyActivities />
			)}
			{!fixture && query.isRefetching && !query.error && (
				<p className="text-muted-foreground text-xs" role="status">
					Memperbarui kegiatan…
				</p>
			)}
		</section>
	);
}

function EmptyActivities() {
	return (
		<Card className="resora-panel">
			<CardContent className="flex min-h-32 items-center gap-3 p-4 sm:p-5">
				<CalendarDays
					aria-hidden="true"
					className="size-5 shrink-0 text-muted-foreground"
				/>
				<p className="text-muted-foreground text-sm">
					Belum ada kegiatan mendatang.
				</p>
			</CardContent>
		</Card>
	);
}
