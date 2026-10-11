"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryClient, trpc } from "@/utils/trpc";

export default function EventDetail({ eventId }: { eventId: string }) {
	const detail = useQuery({
		...trpc.attendance.detail.queryOptions({ eventId }),
		retry: false,
	});
	const canManage = detail.data?.canManage ?? false;
	const preview = useQuery({
		...trpc.attendance.preview.queryOptions({ eventId }),
		enabled: canManage && detail.data?.event.status === "DRAFT",
		retry: false,
	});
	const qr = useQuery({
		...trpc.attendance.qr.queryOptions({ eventId }),
		enabled: canManage && detail.data?.session.status === "ACTIVE",
		retry: false,
		refetchInterval: 15_000,
	});
	const publish = useMutation(trpc.attendance.publish.mutationOptions());
	const activate = useMutation(trpc.attendance.activate.mutationOptions());
	const close = useMutation(trpc.attendance.close.mutationOptions());
	const revoke = useMutation(trpc.attendance.revokeQr.mutationOptions());
	const reissue = useMutation(trpc.attendance.reissueQr.mutationOptions());
	const metadata = useMutation(trpc.attendance.editMetadata.mutationOptions());
	const [error, setError] = useState("");
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const act = async (operation: () => Promise<unknown>) => {
		setError("");
		try {
			await operation();
			await queryClient.invalidateQueries({
				queryKey: trpc.attendance.pathKey(),
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Operasi gagal");
		}
	};
	if (detail.isPending)
		return (
			<p role="status" className="p-6">
				Memuat event...
			</p>
		);
	if (detail.error)
		return (
			<p role="alert" className="p-6">
				Event tidak tersedia atau sesi tidak valid.{" "}
				<Link href="/events">Kembali</Link>
			</p>
		);
	const { event, session, participants } = detail.data;
	const busy =
		publish.isPending ||
		activate.isPending ||
		close.isPending ||
		revoke.isPending ||
		reissue.isPending ||
		metadata.isPending;
	const expiry = qr.data?.expiresAt
		? new Date(qr.data.expiresAt).getTime()
		: null;
	const qrUsable =
		qr.data?.state === "ACTIVE" && expiry !== null && now < expiry;
	return (
		<main className="mx-auto max-w-4xl space-y-5 p-6">
			<Link className="focus-ring text-primary underline" href="/events">
				Daftar event
			</Link>
			<h1 className="font-semibold text-2xl">{event.title}</h1>
			<p>{event.description}</p>
			<p>
				{event.status} · session {session.status}
			</p>
			<p>
				{new Date(event.startsAt).toLocaleString("id-ID", {
					timeZone: "Asia/Jakarta",
				})}{" "}
				sampai{" "}
				{new Date(event.endsAt).toLocaleString("id-ID", {
					timeZone: "Asia/Jakarta",
				})}{" "}
				WIB
			</p>
			<p>
				Pusat: {session.centerLat}, {session.centerLng}; radius{" "}
				{session.geofenceRadiusM} m; toleransi {session.lateGraceMinutes} menit;
				TTL QR {session.qrTtlMinutes} menit.
			</p>
			{canManage && (
				<Card>
					<CardContent className="space-y-4">
						{event.status === "DRAFT" && (
							<>
								<Link
									className="focus-ring text-primary underline"
									href={`/events/${eventId}/edit`}
								>
									Edit draft
								</Link>
								<p>
									Preview {preview.data?.participants.length ?? 0} peserta.
									Publish membekukan roster, jadwal dan konfigurasi session.
								</p>
								<Button
									disabled={busy || preview.isPending || Boolean(preview.error)}
									onClick={() => act(() => publish.mutateAsync({ eventId }))}
								>
									Publish
								</Button>
							</>
						)}
						{event.status === "PUBLISHED" && (
							<>
								<form
									className="space-y-3"
									onSubmit={(e) => {
										e.preventDefault();
										const data = new FormData(e.currentTarget);
										void act(() =>
											metadata.mutateAsync({
												eventId,
												title: String(data.get("title") ?? ""),
												description: String(data.get("description") ?? ""),
											}),
										);
									}}
								>
									<label className="block">
										Judul
										<input
											name="title"
											required
											maxLength={200}
											defaultValue={event.title}
											className="focus-ring block w-full rounded border p-2"
										/>
									</label>
									<label className="block">
										Deskripsi
										<textarea
											name="description"
											maxLength={5000}
											defaultValue={event.description}
											className="focus-ring block w-full rounded border p-2"
										/>
									</label>
									<Button type="submit" disabled={busy}>
										Simpan judul/deskripsi
									</Button>
								</form>
								{session.status === "INACTIVE" && (
									<Button
										disabled={busy}
										onClick={() => act(() => activate.mutateAsync({ eventId }))}
									>
										Aktifkan session & QR
									</Button>
								)}
								{session.status === "ACTIVE" && (
									<div className="space-y-3">
										<p role="status">
											QR:{" "}
											{qrUsable
												? "ACTIVE"
												: qr.data?.state === "ACTIVE"
													? "EXPIRED"
													: (qr.data?.state ?? "Memuat")}
										</p>
										{qr.error && (
											<p role="alert">
												QR gagal dimuat.{" "}
												<Button variant="outline" onClick={() => qr.refetch()}>
													Coba kembali
												</Button>
											</p>
										)}
										{qrUsable && qr.data?.image && (
											<Image
												unoptimized
												src={qr.data.image}
												alt="QR attendance session untuk event ini"
												width={320}
												height={320}
											/>
										)}
										{expiry && (
											<p>
												Berlaku sampai{" "}
												{new Date(expiry).toLocaleString("id-ID", {
													timeZone: "Asia/Jakarta",
												})}{" "}
												WIB
											</p>
										)}
										<Button
											variant="outline"
											disabled={busy || !qrUsable}
											onClick={() => act(() => revoke.mutateAsync({ eventId }))}
										>
											Revoke QR
										</Button>
										<Button
											variant="outline"
											disabled={busy || qr.isPending || qrUsable || !qr.data}
											onClick={() =>
												act(() => reissue.mutateAsync({ eventId }))
											}
										>
											Reissue QR
										</Button>
									</div>
								)}
								<p>
									Tutup event mengakhiri session dan membatalkan QR. Event tidak
									dapat dibuka kembali.
								</p>
								<Button
									variant="danger"
									disabled={busy}
									onClick={() => act(() => close.mutateAsync({ eventId }))}
								>
									Tutup event
								</Button>
							</>
						)}
					</CardContent>
				</Card>
			)}
			{error && <p role="alert">{error}</p>}
			{canManage && (
				<section className="space-y-2">
					<h2 className="font-semibold">
						{event.status === "DRAFT"
							? "Preview peserta terkini"
							: "Snapshot undangan"}
					</h2>
					{preview.error && event.status === "DRAFT" && (
						<p role="alert">Preview gagal dimuat.</p>
					)}
					{(preview.data?.invalidAssignmentCount ?? 0) > 0 && (
						<p role="alert">
							Assignment tidak valid dikecualikan; perlu review Identity.
						</p>
					)}
					{event.status === "DRAFT"
						? preview.data?.participants.map((sr) => (
								<p key={sr.userId}>
									{sr.nim} · {sr.name} · {sr.departmentCode}/{sr.positionCode} ·{" "}
									{sr.buildingName}
								</p>
							))
						: participants.map((sr) => (
								<p key={sr.userId}>
									{sr.nim} · {sr.name} · {sr.departmentCode}/{sr.positionCode} ·{" "}
									{sr.buildingName}
								</p>
							))}
				</section>
			)}
			{!canManage && (
				<p>Anda diundang pada event ini. Check-in belum tersedia.</p>
			)}
		</main>
	);
}
