"use client";

import { QrCode } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	formatEventTime,
	StatusBadge,
} from "../../../components/event-feedback";
import type { EventDetailView } from "./detail-model";
import { useEventConfirmation } from "./event-confirmation";
export function SessionPanel({ view }: { view: EventDetailView }) {
	const { confirm, confirmation } = useEventConfirmation();
	const {
		eventId,
		activeAction,
		qr,
		activate,
		revoke,
		reissue,
		act,
		event,
		session,
		busy,
		expiry,
		qrUsable,
		qrState,
		data,
	} = view;
	const canManage = data.canManage;
	const srImage = qr.data?.srImage ?? null;
	const dtImage = qr.data?.dtImage ?? null;
	const hasDualQr = Boolean(srImage && dtImage);
	const singleImage = srImage ?? dtImage ?? qr.data?.image ?? null;
	return (
		<Card>
			<CardHeader
				title={canManage ? "QR kehadiran" : "QR kehadiran Dorm Team (DT)"}
				icon={<QrCode size={20} aria-hidden="true" />}
				description={
					canManage
						? "QR yang aktif tetap sama saat halaman dimuat ulang."
						: "Ditampilkan otomatis ketika HCO mengaktifkan sesi kehadiran kepanitiaan."
				}
			/>
			<CardContent className="space-y-4">
				{session.status === "INACTIVE" && (
					<>
						<p className="text-muted-foreground text-sm">
							{canManage
								? "Sesi belum aktif. Aktifkan sesi untuk menampilkan QR dengan masa berlaku yang telah ditetapkan."
								: "Sesi belum aktif. Menunggu HCO mengaktifkan sesi dan menampilkan QR DT."}
						</p>
						{canManage && event.visibility !== "VISIBLE" && (
							<p className="text-muted-foreground text-sm">
								Event disembunyikan. SUPERADMIN perlu menampilkannya kembali
								sebelum sesi dapat diaktifkan.
							</p>
						)}
						{canManage && (
							<Button
								disabled={busy || event.visibility !== "VISIBLE"}
								loading={activeAction === "activate"}
								onClick={() =>
									act("activate", "Sesi dan QR berhasil diaktifkan.", () =>
										activate.mutateAsync({ eventId }),
									)
								}
							>
								{activeAction === "activate"
									? "Mengaktifkan sesi…"
									: "Aktifkan sesi dan QR"}
							</Button>
						)}
					</>
				)}
				{session.status === "ACTIVE" && (
					<>
						{qr.isPending && (
							<p role="status" className="text-muted-foreground text-sm">
								Memuat QR…
							</p>
						)}
						{qrState && (
							<div
								role="status"
								className="flex items-center justify-between gap-3"
							>
								<span className="text-muted-foreground text-sm">Status QR</span>
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
						{qrUsable && hasDualQr && srImage && dtImage && (
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2 rounded-xl border border-border bg-white p-4 text-center">
									<p className="font-semibold text-foreground text-xs">
										QR Senior Resident (SR)
									</p>
									<div className="flex justify-center">
										<Image
											unoptimized
											src={srImage}
											alt="QR kehadiran Senior Resident untuk event ini"
											width={320}
											height={320}
											className="h-auto w-full max-w-64"
										/>
									</div>
									<p className="text-muted-foreground text-[11px]">
										Hanya dapat dipindai oleh akun SR yang diundang.
									</p>
								</div>
								<div className="space-y-2 rounded-xl border border-border bg-white p-4 text-center">
									<p className="font-semibold text-primary text-xs">
										QR Dorm Team (DT)
									</p>
									<div className="flex justify-center">
										<Image
											unoptimized
											src={dtImage}
											alt="QR kehadiran Dorm Team untuk event ini"
											width={320}
											height={320}
											className="h-auto w-full max-w-64"
										/>
									</div>
									<p className="text-muted-foreground text-[11px]">
										Khusus DT; tampil juga read-only di Departemen Adaptif.
									</p>
								</div>
							</div>
						)}
						{qrUsable && !hasDualQr && singleImage && (
							<div className="space-y-2 rounded-xl border border-border bg-white p-4 text-center">
								{dtImage && (
									<p className="font-semibold text-primary text-xs">
										QR Dorm Team (DT)
									</p>
								)}
								<div className="flex justify-center">
									<Image
										unoptimized
										src={singleImage}
										alt={
											dtImage
												? "QR kehadiran Dorm Team untuk event ini"
												: "QR kehadiran untuk event ini"
										}
										width={320}
										height={320}
										className="h-auto w-full max-w-80"
									/>
								</div>
								{dtImage && (
									<p className="text-muted-foreground text-[11px]">
										Hanya akun DT aktif yang diundang yang dapat check-in
										melalui QR ini.
									</p>
								)}
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
								{canManage
									? "QR tidak dapat digunakan. Terbitkan QR baru untuk melanjutkan; event tetap terbuka."
									: "QR tidak aktif atau dibatalkan oleh HCO."}
							</p>
						)}
						{canManage && (
							<div className="flex flex-wrap gap-3">
								<Button
									variant="danger"
									disabled={busy || !qrUsable}
									loading={activeAction === "revoke"}
									onClick={async () => {
										if (
											await confirm(
												"Batalkan QR ini? QR yang sedang ditampilkan tidak dapat digunakan lagi. Kamu dapat menerbitkan QR baru.",
												"Batalkan QR",
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
						)}
					</>
				)}
				{confirmation}
			</CardContent>
		</Card>
	);
}
