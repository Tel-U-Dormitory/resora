"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, QrCode, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { refreshAttendanceQueries } from "./attendance-queries";
import { EventAuditHistory } from "./event-admin-history";
import EventRecap from "./event-recap";
import { eventErrorMessage, formatEventTime, StatusBadge } from "./event-ui";
import { participantPage } from "./participant-list";

const administrativeLabels = {
	HIDE: "Sembunyikan event",
	UNHIDE: "Tampilkan event kembali",
	ARCHIVE: "Arsipkan event",
	RESTORE: "Pulihkan dari arsip",
	DELETE_DRAFT: "Hapus draft permanen",
} as const;
type AdministrativeAction = keyof typeof administrativeLabels;

export default function EventDetail({ eventId }: { eventId: string }) {
	const router = useRouter();
	const actionLock = useRef(false);
	const [activeAction, setActiveAction] = useState<string | null>(null);
	const [feedback, setFeedback] = useState("");
	const [invitationToggle, setInvitationToggle] = useState<{
		eventId: string;
		status: string;
		open: boolean;
	} | null>(null);
	const [invitationSearch, setInvitationSearch] = useState("");
	const [invitationPage, setInvitationPage] = useState(1);
	const publish = useMutation(trpc.attendance.publish.mutationOptions());
	const close = useMutation(trpc.attendance.close.mutationOptions());
	const detail = useQuery({
		...trpc.attendance.detail.queryOptions({ eventId }),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const canManage = detail.data?.canManage ?? false;
	const preview = useQuery({
		...trpc.attendance.preview.queryOptions({ eventId }),
		enabled:
			canManage &&
			detail.data?.event.status === "DRAFT" &&
			!activeAction &&
			!publish.isSuccess,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const qr = useQuery({
		...trpc.attendance.qr.queryOptions({ eventId }),
		enabled:
			canManage &&
			detail.data?.session.status === "ACTIVE" &&
			!activeAction &&
			!close.isSuccess,
		retry: false,
		meta: { errorHandledLocally: true },
		refetchInterval: 15_000,
	});
	const activate = useMutation(trpc.attendance.activate.mutationOptions());
	const revoke = useMutation(trpc.attendance.revokeQr.mutationOptions());
	const reissue = useMutation(trpc.attendance.reissueQr.mutationOptions());
	const metadata = useMutation(trpc.attendance.editMetadata.mutationOptions());
	const visibility = useMutation(
		trpc.attendance.setVisibility.mutationOptions(),
	);
	const deleteDraft = useMutation(
		trpc.attendance.deleteDraft.mutationOptions(),
	);
	const [administrativeAction, setAdministrativeAction] = useState<
		AdministrativeAction | ""
	>("");
	const [administrativeReason, setAdministrativeReason] = useState("");
	const [error, setError] = useState("");
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const act = async (
		action: string,
		message: string,
		operation: () => Promise<unknown>,
	) => {
		if (actionLock.current) return;
		actionLock.current = true;
		setActiveAction(action);
		setError("");
		setFeedback("");
		try {
			await Promise.all([
				queryClient.cancelQueries({ queryKey: attendanceQueryKeys.preview }),
				queryClient.cancelQueries({ queryKey: attendanceQueryKeys.qr }),
			]);
			await operation();
		} catch (cause) {
			setError(eventErrorMessage(cause));
			actionLock.current = false;
			setActiveAction(null);
			return;
		}
		setFeedback(message);
		try {
			if (action === "deleteDraft") {
				await queryClient.invalidateQueries({
					queryKey: attendanceQueryKeys.all,
					refetchType: "none",
				});
				router.replace("/events?view=manage");
				return;
			}
			if (["activate", "revoke", "reissue", "close"].includes(action))
				await queryClient.resetQueries({
					queryKey: trpc.attendance.qr.queryKey({ eventId }),
				});
			await refreshAttendanceQueries(queryClient, attendanceQueryKeys);
		} catch {
			setFeedback(`${message} Tampilan belum diperbarui; muat ulang halaman.`);
		} finally {
			actionLock.current = false;
			setActiveAction(null);
		}
	};
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
	const { event, session, participants } = detail.data;
	const administration = detail.data.administration;
	const administrativeOptions = administration
		? [
				...administration.visibilityActions,
				...(administration.canDeleteDraft ? ["DELETE_DRAFT" as const] : []),
			]
		: [];
	const busy =
		(close.isSuccess && event.status !== "CLOSED") ||
		deleteDraft.isSuccess ||
		Boolean(activeAction) ||
		publish.isPending ||
		activate.isPending ||
		close.isPending ||
		revoke.isPending ||
		reissue.isPending ||
		metadata.isPending ||
		visibility.isPending ||
		deleteDraft.isPending;
	const expiry = qr.data?.expiresAt
		? new Date(qr.data.expiresAt).getTime()
		: null;
	const qrUsable =
		qr.data?.state === "ACTIVE" && expiry !== null && now < expiry;
	const qrState =
		qr.data?.state === "ACTIVE" && !qrUsable ? "EXPIRED" : qr.data?.state;
	const invited =
		event.status === "DRAFT" ? preview.data?.participants : participants;
	const invitationsOpen =
		invitationToggle?.eventId === eventId &&
		invitationToggle.status === event.status
			? invitationToggle.open
			: event.status === "DRAFT";
	const visibleInvitations = participantPage<
		NonNullable<typeof invited>[number]
	>(invited ?? [], invitationSearch, invitationPage);
	return (
		<section className="min-w-0 space-y-6">
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
			{detail.data.advancedEditMode && (
				<Link
					href={`/events/${eventId}/edit`}
					className="focus-ring inline-flex rounded-md border border-border px-4 py-2 font-semibold text-sm hover:bg-muted"
				>
					Edit event (SUPERADMIN)
				</Link>
			)}
			{administration && (
				<Card>
					<CardHeader
						title="Administrasi event"
						description="Tindakan SUPERADMIN memerlukan alasan dan konfirmasi, serta dicatat dalam audit."
					/>
					<CardContent className="space-y-4">
						{administrativeOptions.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{event.status === "DRAFT"
									? "Draft memiliki sesi yang pernah digunakan atau referensi operasional/audit sehingga tidak dapat dihapus."
									: "Perubahan visibilitas tidak tersedia pada kondisi sesi ini. Sesi aktif tidak dapat disembunyikan."}
							</p>
						) : (
							<form
								className="space-y-4"
								onSubmit={(e) => {
									e.preventDefault();
									if (
										busy ||
										!administrativeAction ||
										!administrativeOptions.includes(administrativeAction)
									)
										return;
									if (!administrativeReason.trim()) {
										setError("Alasan administratif wajib diisi.");
										return;
									}
									const deleting = administrativeAction === "DELETE_DRAFT";
									if (
										!window.confirm(
											deleting
												? `Hapus draft "${event.title}" secara permanen? Tindakan ini tidak dapat dibatalkan dan bukti audit akan tetap disimpan.`
												: `${administrativeLabels[administrativeAction]} "${event.title}"? Tindakan ini tidak mengubah status event, sesi, QR, atau catatan kehadiran.`,
										)
									)
										return;
									void act(
										deleting ? "deleteDraft" : "visibility",
										deleting
											? "Draft berhasil dihapus. Mengalihkan ke kelola event…"
											: "Visibilitas event berhasil diperbarui.",
										async () => {
											if (administrativeAction === "DELETE_DRAFT")
												await deleteDraft.mutateAsync({
													eventId,
													reason: administrativeReason,
												});
											else
												await visibility.mutateAsync({
													eventId,
													action: administrativeAction,
													reason: administrativeReason,
												});
											setAdministrativeAction("");
											setAdministrativeReason("");
										},
									);
								}}
							>
								<label className="block space-y-2 text-sm">
									Tindakan
									<select
										required
										disabled={busy}
										value={administrativeAction}
										onChange={(e) =>
											setAdministrativeAction(
												e.target.value as AdministrativeAction | "",
											)
										}
										className="focus-ring block w-full rounded-lg border border-border bg-background px-3 py-2"
									>
										<option value="">Pilih tindakan</option>
										{administrativeOptions.map((action) => (
											<option key={action} value={action}>
												{administrativeLabels[action]}
											</option>
										))}
									</select>
								</label>
								<label className="block space-y-2 text-sm">
									Alasan administratif
									<textarea
										required
										maxLength={2000}
										disabled={busy}
										value={administrativeReason}
										onChange={(e) => setAdministrativeReason(e.target.value)}
										className="focus-ring block w-full rounded-lg border border-border bg-background px-3 py-2"
									/>
								</label>
								<Button
									type="submit"
									variant={
										administrativeAction === "DELETE_DRAFT"
											? "danger"
											: "outline"
									}
									disabled={busy || !administrativeAction}
									loading={
										activeAction === "visibility" ||
										activeAction === "deleteDraft"
									}
								>
									{activeAction === "visibility" ||
									activeAction === "deleteDraft"
										? "Memproses…"
										: "Konfirmasi tindakan"}
								</Button>
							</form>
						)}
					</CardContent>
				</Card>
			)}
			{canManage && event.status === "PUBLISHED" && (
				<>
					<div className="grid items-stretch gap-6 xl:grid-cols-2">
						<Card>
							<CardHeader
								title="Informasi event"
								icon={<CalendarDays size={20} aria-hidden="true" />}
								description={
									detail.data.advancedEditMode
										? "Perubahan SUPERADMIN mengikuti status sesi dan kehadiran terkini."
										: "Hanya judul dan deskripsi yang dapat diubah setelah publikasi."
								}
							/>
							<CardContent>
								{detail.data.advancedEditMode ? (
									<p className="text-muted-foreground text-sm">
										Gunakan Edit event (SUPERADMIN) untuk perubahan
										administratif dengan alasan dan audit.
									</p>
								) : (
									<form
										key={event.updatedAt}
										className="space-y-4"
										onSubmit={(e) => {
											e.preventDefault();
											const data = new FormData(e.currentTarget);
											void act(
												"metadata",
												"Perubahan event berhasil disimpan.",
												() =>
													metadata.mutateAsync({
														eventId,
														title: String(data.get("title") ?? ""),
														description: String(data.get("description") ?? ""),
													}),
											);
										}}
									>
										<label className="block space-y-2 text-sm">
											Judul
											<input
												name="title"
												disabled={busy}
												required
												maxLength={200}
												defaultValue={event.title}
												className="focus-ring block w-full rounded-lg border border-border bg-background px-3 py-2"
											/>
										</label>
										<label className="block space-y-2 text-sm">
											Deskripsi
											<textarea
												name="description"
												disabled={busy}
												rows={4}
												maxLength={5000}
												defaultValue={event.description}
												className="focus-ring block w-full rounded-lg border border-border bg-background px-3 py-2"
											/>
										</label>
										<Button
											type="submit"
											disabled={busy}
											loading={activeAction === "metadata"}
										>
											{activeAction === "metadata"
												? "Menyimpan perubahan…"
												: "Simpan perubahan"}
										</Button>
									</form>
								)}
							</CardContent>
						</Card>
						<Card>
							<CardHeader
								title="QR kehadiran"
								icon={<QrCode size={20} aria-hidden="true" />}
								description="QR yang aktif tetap sama saat halaman dimuat ulang."
							/>
							<CardContent className="space-y-4">
								{session.status === "INACTIVE" && (
									<>
										<p className="text-muted-foreground text-sm">
											Sesi belum aktif. Aktifkan sesi untuk menampilkan QR
											dengan masa berlaku yang telah ditetapkan.
										</p>
										{event.visibility !== "VISIBLE" && (
											<p className="text-muted-foreground text-sm">
												Event disembunyikan. SUPERADMIN perlu menampilkannya
												kembali sebelum sesi dapat diaktifkan.
											</p>
										)}
										<Button
											disabled={busy || event.visibility !== "VISIBLE"}
											loading={activeAction === "activate"}
											onClick={() =>
												act(
													"activate",
													"Sesi dan QR berhasil diaktifkan.",
													() => activate.mutateAsync({ eventId }),
												)
											}
										>
											{activeAction === "activate"
												? "Mengaktifkan sesi…"
												: "Aktifkan sesi dan QR"}
										</Button>
									</>
								)}
								{session.status === "ACTIVE" && (
									<>
										{qr.isPending && (
											<p
												role="status"
												className="text-muted-foreground text-sm"
											>
												Memuat QR…
											</p>
										)}
										{qrState && (
											<div
												role="status"
												className="flex items-center justify-between gap-3"
											>
												<span className="text-muted-foreground text-sm">
													Status QR
												</span>
												<StatusBadge status={qrState} />
											</div>
										)}
										{qr.error && (
											<div className="space-y-3">
												<p role="alert" className="text-destructive text-sm">
													QR gagal dimuat.
												</p>
												<Button
													variant="outline"
													disabled={qr.isFetching}
													loading={qr.isFetching}
													onClick={() => qr.refetch()}
												>
													{qr.isFetching ? "Memuat QR…" : "Coba kembali"}
												</Button>
											</div>
										)}
										{qrUsable && qr.data?.image && (
											<div className="flex justify-center rounded-xl border border-border bg-white p-4">
												<Image
													unoptimized
													src={qr.data.image}
													alt="QR kehadiran untuk event ini"
													width={320}
													height={320}
													className="h-auto w-full max-w-80"
												/>
											</div>
										)}
										{expiry !== null && (
											<p className="text-muted-foreground text-sm">
												{qrUsable ? "Berlaku sampai" : "Batas berlaku"}{" "}
												<span className="font-medium text-foreground">
													{formatEventTime(new Date(expiry).toISOString())}
												</span>
											</p>
										)}
										{qr.data && !qrUsable && (
											<p className="text-muted-foreground text-sm">
												QR tidak dapat digunakan. Terbitkan QR baru untuk
												melanjutkan; event tetap terbuka.
											</p>
										)}
										<div className="flex flex-wrap gap-3">
											<Button
												variant="danger"
												disabled={busy || !qrUsable}
												loading={activeAction === "revoke"}
												onClick={() => {
													if (
														window.confirm(
															"Batalkan QR ini? QR yang sedang ditampilkan tidak dapat digunakan lagi. Anda dapat menerbitkan QR baru.",
														)
													)
														void act("revoke", "QR berhasil dibatalkan.", () =>
															revoke.mutateAsync({ eventId }),
														);
												}}
											>
												{activeAction === "revoke"
													? "Membatalkan QR…"
													: "Batalkan QR"}
											</Button>
											<Button
												variant="outline"
												disabled={busy || qr.isPending || qrUsable || !qr.data}
												loading={activeAction === "reissue"}
												onClick={() =>
													act("reissue", "QR baru berhasil diterbitkan.", () =>
														reissue.mutateAsync({ eventId }),
													)
												}
											>
												{activeAction === "reissue"
													? "Menerbitkan QR…"
													: "Terbitkan QR baru"}
											</Button>
										</div>
									</>
								)}
							</CardContent>
						</Card>
					</div>
					<Card className="border-danger/30">
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
			{canManage && (
				<Card>
					<CardHeader
						title={
							event.status === "DRAFT" ? "Preview peserta" : "Daftar undangan"
						}
						description={
							event.status === "DRAFT"
								? "Peserta aktif terkini. Daftar final disimpan saat publikasi."
								: "Daftar ini menyimpan informasi peserta saat event dipublikasikan."
						}
						icon={<Users size={20} aria-hidden="true" />}
						className="flex-col sm:flex-row"
						action={
							<div className="flex flex-wrap items-center gap-2">
								<span className="whitespace-nowrap rounded-full bg-muted px-3 py-1 font-semibold text-sm">
									{invited?.length ?? 0} peserta
								</span>
								<Button
									variant="outline"
									size="sm"
									aria-expanded={invitationsOpen}
									aria-controls="event-invitations"
									onClick={() =>
										setInvitationToggle({
											eventId,
											status: event.status,
											open: !invitationsOpen,
										})
									}
								>
									{invitationsOpen ? "Sembunyikan" : "Lihat undangan"}
								</Button>
							</div>
						}
					/>
					<CardContent
						id="event-invitations"
						hidden={!invitationsOpen}
						className="space-y-3"
					>
						<label className="block space-y-2 text-sm">
							Cari nama atau NIM
							<input
								type="search"
								value={invitationSearch}
								onChange={(e) => {
									setInvitationSearch(e.target.value);
									setInvitationPage(1);
								}}
								className="focus-ring block w-full rounded-lg border border-border bg-background px-3 py-2"
							/>
						</label>
						{event.status === "DRAFT" && preview.isPending && (
							<p role="status" className="text-muted-foreground text-sm">
								Memuat preview peserta…
							</p>
						)}
						{event.status === "DRAFT" && preview.error && (
							<div className="space-y-3">
								<p role="alert" className="text-destructive text-sm">
									Preview peserta gagal dimuat.
								</p>
								<Button
									variant="outline"
									disabled={preview.isFetching}
									loading={preview.isFetching}
									onClick={() => preview.refetch()}
								>
									{preview.isFetching ? "Memuat peserta…" : "Coba kembali"}
								</Button>
							</div>
						)}
						{event.status === "DRAFT" &&
							(preview.data?.invalidAssignmentCount ?? 0) > 0 && (
								<p role="alert" className="text-sm text-warning">
									Akun dengan penempatan organisasi tidak valid dikecualikan.
									Hubungi pengelola akun.
								</p>
							)}
						{invited?.length === 0 && (
							<p className="py-4 text-center text-muted-foreground text-sm">
								Belum ada peserta dalam daftar undangan.
							</p>
						)}
						{Boolean(invited?.length) && visibleInvitations.matching === 0 && (
							<p className="py-4 text-muted-foreground text-sm">
								Tidak ada peserta yang sesuai dengan pencarian.
							</p>
						)}
						{Boolean(invited?.length) && (
							<div className="overflow-x-auto rounded-lg border border-border">
								<table className="w-full text-left text-sm">
									<caption className="sr-only">Peserta yang diundang</caption>
									<thead>
										<tr className="border-border border-b bg-muted/50">
											<th scope="col" className="p-3">
												Peserta
											</th>
											<th scope="col" className="p-3">
												Departemen / Jabatan
											</th>
											<th scope="col" className="p-3">
												Gedung
											</th>
										</tr>
									</thead>
									<tbody>
										{visibleInvitations.rows.map((sr) => (
											<tr
												key={sr.userId}
												className="border-border border-b last:border-0"
											>
												<td className="p-3">
													<p className="font-medium">{sr.name}</p>
													<p className="text-muted-foreground text-xs">
														{sr.nim}
													</p>
												</td>
												<td className="whitespace-nowrap p-3">
													{sr.departmentCode} / {sr.positionCode}
												</td>
												<td className="whitespace-nowrap p-3">
													{sr.buildingName}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
						<div className="flex flex-wrap items-center justify-between gap-3">
							<p className="text-muted-foreground text-sm">
								Halaman {visibleInvitations.page} dari{" "}
								{visibleInvitations.pages} · {visibleInvitations.matching}{" "}
								peserta
							</p>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={visibleInvitations.page === 1}
									onClick={() => setInvitationPage(visibleInvitations.page - 1)}
								>
									Sebelumnya
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={
										visibleInvitations.page === visibleInvitations.pages
									}
									onClick={() => setInvitationPage(visibleInvitations.page + 1)}
								>
									Berikutnya
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
			{!canManage && (
				<p className="rounded-xl border border-primary/20 bg-primary-soft p-5 text-primary-soft-foreground text-sm">
					Anda diundang pada event ini. Gunakan Scan QR untuk check-in dan
					riwayat kehadiran untuk melihat status pribadi.
				</p>
			)}
			{administration && <EventAuditHistory eventId={eventId} />}
			{canManage && event.status !== "DRAFT" && (
				<EventRecap eventId={eventId} />
			)}
		</section>
	);
}
