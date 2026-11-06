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
export function SessionPanel({ view }: { view: EventDetailView }) {
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
	} = view;
	return (
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
							Sesi belum aktif. Aktifkan sesi untuk menampilkan QR dengan masa
							berlaku yang telah ditetapkan.
						</p>
						{event.visibility !== "VISIBLE" && (
							<p className="text-muted-foreground text-sm">
								Event disembunyikan. SUPERADMIN perlu menampilkannya kembali
								sebelum sesi dapat diaktifkan.
							</p>
						)}
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
								QR tidak dapat digunakan. Terbitkan QR baru untuk melanjutkan;
								event tetap terbuka.
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
								{activeAction === "revoke" ? "Membatalkan QR…" : "Batalkan QR"}
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
	);
}
