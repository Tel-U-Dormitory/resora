"use client";

import { CalendarDays, MapPin } from "lucide-react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EventRecap } from "@/features/attendance/public";

import {
	eventErrorMessage,
	formatEventTime,
	StatusBadge,
} from "../../../components/event-feedback";

import { EventAuditHistory } from "../event-admin-history";
import { AdministrationPanel } from "./administration-panel";
import { createDetailView, useEventDetail } from "./detail-model";
import { InvitationsPanel } from "./invitations-panel";
import { MetadataPanel } from "./metadata-panel";
import { SessionPanel } from "./session-panel";
export default function EventDetail({ eventId }: { eventId: string }) {
	const state = useEventDetail(eventId);
	const { detail } = state;
	if (detail.isPending)
		return (
			<div role="status" className="space-y-4">
				<p className="text-muted-foreground text-sm">Memuat event…</p>
				<Skeleton className="h-10 w-2/3" />
				<Skeleton className="h-64 w-full rounded-xl" />
			</div>
		);
	if (!detail.data)
		return (
			<Card>
				<CardContent className="space-y-4">
					<p role="alert" className="text-destructive text-sm">
						{eventErrorMessage(detail.error)}
					</p>
					<Link
						className="focus-ring rounded-md text-primary underline"
						href="/events"
					>
						Kembali ke daftar event
					</Link>
				</CardContent>
			</Card>
		);
	const view = createDetailView(state, detail.data);
	const {
		activeAction,
		feedback,
		publish,
		close,
		canManage,
		preview,
		activate,
		revoke,
		reissue,
		metadata,
		visibility,
		deleteDraft,
		error,
		act,
		event,
		session,
		administration,
		busy,
		data,
	} = view;
	return (
		<section className="resora-page min-w-0 space-y-6">
			<nav aria-label="Breadcrumb event" className="text-sm">
				<ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<li>
						<Link
							className="focus-ring rounded-md text-muted-foreground hover:text-primary"
							href="/events"
						>
							Event internal
						</Link>
					</li>
					<li aria-hidden="true" className="text-muted-foreground">
						/
					</li>
					<li className="min-w-0 flex-1">
						<span
							aria-current="page"
							className="block truncate font-medium"
							title={event.title}
						>
							{event.title}
						</span>
					</li>
				</ol>
			</nav>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="min-w-0 break-words font-bold text-2xl tracking-tight">
						{event.title}
					</h1>
					<StatusBadge status={event.status} />
					{event.visibility !== "VISIBLE" && (
						<StatusBadge status={event.visibility} />
					)}
				</div>
				<p className="whitespace-pre-wrap break-words text-muted-foreground">
					{event.description || "Belum ada deskripsi event."}
				</p>
				<p className="text-muted-foreground text-sm">
					Kepengurusan Event:{" "}
					{event.organizationContext === "COMMITTEE"
						? `Kepanitiaan Kegiatan · ${data.committeeName ?? "Kepanitiaan"}`
						: "Struktural SR"}
				</p>
			</div>
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm"
				>
					{error}
				</p>
			)}
			{feedback && (
				<p
					role="status"
					className="rounded-lg border border-border bg-muted p-4 text-sm"
				>
					{feedback}
				</p>
			)}
			{detail.isRefetchError && (
				<p role="alert" className="text-muted-foreground text-sm">
					Tampilan event belum berhasil diperbarui. Muat ulang halaman; jangan
					mengulangi aksi yang sudah berhasil.
				</p>
			)}
			{activeAction &&
				![
					publish,
					activate,
					close,
					revoke,
					reissue,
					metadata,
					visibility,
					deleteDraft,
				].some((mutation) => mutation.isPending) && (
					<p role="status" className="text-muted-foreground text-sm">
						Memperbarui tampilan event…
					</p>
				)}
			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader
						title="Jadwal event"
						icon={<CalendarDays size={20} aria-hidden="true" />}
					/>
					<CardContent>
						<dl className="space-y-4 text-sm">
							<div>
								<dt className="text-muted-foreground">Mulai</dt>
								<dd className="mt-1 font-medium">
									{formatEventTime(event.startsAt)}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Selesai</dt>
								<dd className="mt-1 font-medium">
									{formatEventTime(event.endsAt)}
								</dd>
							</div>
							<div className="flex items-center justify-between gap-3">
								<dt className="text-muted-foreground">Sesi kehadiran</dt>
								<dd>
									<StatusBadge status={session.status} />
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
				<Card>
					<CardHeader
						title="Lokasi dan konfigurasi"
						icon={<MapPin size={20} aria-hidden="true" />}
					/>
					<CardContent>
						<dl className="grid gap-4 text-sm sm:grid-cols-2">
							<div className="sm:col-span-2">
								<dt className="text-muted-foreground">
									Titik pusat (latitude, longitude)
								</dt>
								<dd className="mt-1 font-medium">
									{session.centerLat}, {session.centerLng}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Radius lokasi</dt>
								<dd className="mt-1 font-medium">
									{session.geofenceRadiusM} meter
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									Toleransi keterlambatan
								</dt>
								<dd className="mt-1 font-medium">
									{session.lateGraceMinutes} menit
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Masa berlaku QR</dt>
								<dd className="mt-1 font-medium">
									{session.qrTtlMinutes} menit
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			</div>
			{event.status === "CLOSED" && (
				<div
					role="status"
					className="rounded-xl border border-border bg-muted/50 p-5 text-sm"
				>
					<p className="font-semibold">Event telah ditutup</p>
					<p className="mt-1 text-muted-foreground">
						Sesi kehadiran berakhir dan QR tidak dapat digunakan. Event tidak
						dapat dibuka kembali.
					</p>
				</div>
			)}
			{canManage && event.status === "DRAFT" && (
				<Card>
					<CardHeader
						title="Siap mempublikasikan?"
						description="Jadwal, pilihan peserta, dan konfigurasi akan dikunci setelah publikasi. Sesi perlu diaktifkan secara terpisah."
					/>
					<CardContent className="flex flex-wrap items-center gap-4">
						<Link
							href={`/events/${eventId}/edit`}
							className="focus-ring rounded-md font-semibold text-primary text-sm underline"
						>
							Edit draft
						</Link>
						<Button
							disabled={
								busy ||
								publish.isSuccess ||
								preview.isPending ||
								Boolean(preview.error)
							}
							loading={activeAction === "publish"}
							onClick={() =>
								act("publish", "Event berhasil dipublikasikan.", () =>
									publish.mutateAsync({ eventId }),
								)
							}
						>
							{activeAction === "publish"
								? "Mempublikasikan…"
								: "Publikasikan event"}
						</Button>
					</CardContent>
				</Card>
			)}
			{data.advancedEditMode && (
				<Link
					href={`/events/${eventId}/edit`}
					className="focus-ring inline-flex rounded-md border border-border px-4 py-2 font-semibold text-sm hover:bg-muted"
				>
					Edit event (SUPERADMIN)
				</Link>
			)}
			{administration && <AdministrationPanel view={view} />}
			{canManage && event.status === "PUBLISHED" && (
				<>
					<div className="grid items-stretch gap-6 xl:grid-cols-2">
						<MetadataPanel view={view} />
						<SessionPanel view={view} />
					</div>
					<Card className="resora-danger-panel">
						<CardContent className="flex flex-wrap items-center justify-between gap-4">
							<div className="max-w-xl space-y-1">
								<h2 className="font-semibold">Tutup event</h2>
								<p className="text-muted-foreground text-sm">
									Mengakhiri sesi dan membatalkan QR. Event tidak dapat dibuka
									kembali.
								</p>
							</div>
							<Button
								variant="danger"
								className="w-full sm:w-auto"
								disabled={busy}
								loading={activeAction === "close"}
								onClick={() => {
									if (
										window.confirm(
											"Tutup event ini? Sesi akan berakhir dan QR dibatalkan. Event tidak dapat dibuka kembali.",
										)
									)
										void act(
											"close",
											"Event dan sesi kehadiran berhasil ditutup.",
											() => close.mutateAsync({ eventId }),
										);
								}}
							>
								{activeAction === "close" ? "Menutup event…" : "Tutup event"}
							</Button>
						</CardContent>
					</Card>
				</>
			)}
			{canManage && <InvitationsPanel view={view} />}
			{!canManage && (
				<p className="rounded-xl border border-primary/20 bg-primary-soft p-5 text-primary-soft-foreground text-sm">
					Anda diundang pada event ini. Gunakan Scan QR untuk check-in dan
					riwayat kehadiran untuk melihat status pribadi.
				</p>
			)}
			{administration && <EventAuditHistory eventId={eventId} />}
			{canManage && event.status !== "DRAFT" && (
				<EventRecap key={eventId} eventId={eventId} />
			)}
		</section>
	);
}
