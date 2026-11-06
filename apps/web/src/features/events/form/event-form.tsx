"use client";

import { Skeleton } from "@resora/ui/components/skeleton";

import { useQuery } from "@tanstack/react-query";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { eventErrorMessage } from "../../../components/event-feedback";
import { DraftEditor } from "./draft-editor";
import { type Draft, empty } from "./form-model";
export default function EventForm({ eventId }: { eventId?: string }) {
	const detail = useQuery({
		...trpc.attendance.detail.queryOptions({
			eventId: eventId ?? "00000000-0000-0000-0000-000000000000",
		}),
		enabled: Boolean(eventId),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const advancedMode = detail.data?.advancedEditMode ?? undefined;
	const needsDirectory =
		!eventId ||
		detail.data?.event.status === "DRAFT" ||
		advancedMode === "FULL";
	const directory = useQuery({
		...trpc.attendance.directory.queryOptions(),
		enabled: needsDirectory,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	if ((needsDirectory && directory.isPending) || (eventId && detail.isPending))
		return (
			<div role="status" className="space-y-4">
				<span className="sr-only">Memuat formulir…</span>
				<Skeleton className="h-10 w-48 rounded-xl" />
				<Skeleton className="h-64 rounded-2xl" />
				<Skeleton className="h-48 rounded-2xl" />
			</div>
		);
	const loadError = (needsDirectory && directory.error) || detail.error;
	if (loadError)
		return (
			<Card>
				<CardContent className="space-y-4">
					<h1 className="font-semibold text-lg">Form belum dapat dimuat</h1>
					<p role="alert" className="text-muted-foreground text-sm">
						{eventErrorMessage(loadError)}
					</p>
					<div className="flex flex-wrap items-center gap-4">
						<Button
							variant="outline"
							disabled={directory.isFetching || detail.isFetching}
							onClick={() => {
								if (needsDirectory) void directory.refetch();
								if (eventId) void detail.refetch();
							}}
						>
							Coba kembali
						</Button>
						<Link
							className="focus-ring rounded-lg text-primary text-sm"
							href="/events?view=manage"
						>
							Kembali ke daftar event
						</Link>
					</div>
				</CardContent>
			</Card>
		);
	if (
		eventId &&
		(!detail.data?.canManage ||
			(detail.data.event.status !== "DRAFT" && !advancedMode))
	)
		return (
			<p role="alert" className="text-sm">
				Event ini tidak dapat diedit dengan izin atau status saat ini.
			</p>
		);
	const data = detail.data;
	const initial: Draft = data?.event.rosterCriteria
		? {
				title: data.event.title,
				description: data.event.description,
				startsAt: data.event.startsAt,
				endsAt: data.event.endsAt,
				rosterCriteria: data.event.rosterCriteria,
				organizationContext: data.event.organizationContext,
				committeeId: data.event.committeeId,
				session: {
					centerLat: data.session.centerLat,
					centerLng: data.session.centerLng,
					geofenceRadiusM: data.session.geofenceRadiusM,
					lateGraceMinutes: data.session.lateGraceMinutes,
					qrTtlMinutes: data.session.qrTtlMinutes,
				},
			}
		: empty;
	return (
		<DraftEditor
			key={eventId ?? "new"}
			initial={initial}
			initialCommitteeName={data?.committeeName ?? ""}
			frozenParticipants={
				data?.event.organizationContext === "COMMITTEE" &&
				data.event.status !== "DRAFT"
					? data.participants
					: undefined
			}
			advancedMode={advancedMode}
			eventId={eventId}
			candidates={directory.data?.candidates ?? []}
			invalidCount={directory.data?.invalidAssignmentCount ?? 0}
		/>
	);
}
