"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { eventErrorMessage, formatEventTime } from "./event-ui";

const actions = {
	PUBLISHED_CONFIGURATION_EDITED: "Konfigurasi event diperbarui",
	PUBLISHED_DETAILS_EDITED: "Detail event diperbarui",
	CLOSED_METADATA_EDITED: "Informasi event tertutup diperbarui",
	EVENT_HIDDEN: "Event disembunyikan",
	EVENT_UNHIDDEN: "Event ditampilkan kembali",
	EVENT_ARCHIVED: "Event diarsipkan",
	EVENT_RESTORED: "Event dipulihkan dari arsip",
};
const fields: Record<string, string> = {
	title: "Judul",
	description: "Deskripsi",
	startsAt: "Mulai",
	endsAt: "Selesai",
	geofenceRadiusM: "Radius lokasi (m)",
	lateGraceMinutes: "Toleransi terlambat (menit)",
	qrTtlMinutes: "Masa berlaku QR (menit)",
	location: "Titik lokasi",
	roster: "Pemilihan peserta",
	visibility: "Visibilitas",
};
function value(field: string, content: string | number | null) {
	if (content === null || content === "") return "—";
	if (field === "startsAt" || field === "endsAt")
		return formatEventTime(String(content));
	return (
		(
			{
				VISIBLE: "Ditampilkan",
				HIDDEN: "Disembunyikan",
				ARCHIVED: "Diarsipkan",
			} as Record<string, string>
		)[String(content)] ?? content
	);
}

// Both histories deliberately query only after the operator expands the section.
export function EventAuditHistory({ eventId }: { eventId: string }) {
	const [open, setOpen] = useState(false);
	const [offset, setOffset] = useState(0);
	const query = useQuery({
		...trpc.attendance.eventAuditHistory.queryOptions({
			eventId,
			limit: 20,
			offset,
		}),
		enabled: open,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	return (
		<Card>
			<CardHeader
				title="Riwayat perubahan administratif"
				description="Perubahan SUPERADMIN dan alasan administratif, terbaru terlebih dahulu."
				action={
					<Button
						variant="outline"
						aria-expanded={open}
						aria-controls="event-administrative-history"
						onClick={() => setOpen(!open)}
					>
						{open ? "Tutup riwayat" : "Lihat riwayat"}
					</Button>
				}
			/>
			<CardContent
				id="event-administrative-history"
				hidden={!open}
				className="space-y-4"
			>
				{open && (
					<div className="space-y-4">
						{query.isPending && <p role="status">Memuat riwayat…</p>}
						{query.error && (
							<div role="alert">
								<p>{eventErrorMessage(query.error)}</p>
								<Button
									variant="outline"
									disabled={query.isFetching}
									onClick={() => query.refetch()}
								>
									Coba kembali
								</Button>
							</div>
						)}
						{!query.error && query.data && (
							<>
								{query.data.items.length === 0 && (
									<p className="text-muted-foreground text-sm">
										Belum ada perubahan administratif.
									</p>
								)}
								<ol className="space-y-4">
									{query.data.items.map((item) => (
										<li
											key={item.id}
											className="space-y-3 rounded-lg border border-border p-4 text-sm"
										>
											<p className="font-semibold">{actions[item.action]}</p>
											<p className="text-muted-foreground">
												{item.operator} · {formatEventTime(item.createdAt)}
											</p>
											<p className="whitespace-pre-wrap break-words">
												Alasan: {item.reason}
											</p>
											<dl className="space-y-2">
												{item.changes.map((change) => (
													<div key={change.field}>
														<dt className="font-medium">
															{fields[change.field] ?? change.field}
														</dt>
														<dd className="whitespace-pre-wrap break-words text-muted-foreground">
															{value(change.field, change.before)} →{" "}
															{value(change.field, change.after)}
														</dd>
													</div>
												))}
											</dl>
											{item.participants && (
												<p>
													Undangan: {item.participants.beforeCount} →{" "}
													{item.participants.afterCount} peserta. Ditambahkan:{" "}
													{item.participants.addedCount}; dikeluarkan:{" "}
													{item.participants.removedCount}.
												</p>
											)}
										</li>
									))}
								</ol>
							</>
						)}
						<div className="flex flex-wrap items-center gap-3">
							<Button
								variant="outline"
								disabled={offset === 0 || query.isFetching}
								onClick={() => setOffset(Math.max(0, offset - 20))}
							>
								Sebelumnya
							</Button>
							<span className="text-sm">Halaman {offset / 20 + 1}</span>
							<Button
								variant="outline"
								disabled={
									!query.data?.hasMore || !!query.error || query.isFetching
								}
								onClick={() => setOffset(offset + 20)}
							>
								Berikutnya
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export function DeletedDraftHistory() {
	const [open, setOpen] = useState(false);
	const [offset, setOffset] = useState(0);
	const query = useQuery({
		...trpc.attendance.deletedDraftHistory.queryOptions({ limit: 20, offset }),
		enabled: open,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	return (
		<Card>
			<CardHeader
				title="Riwayat draft dihapus"
				description="Bukti audit permanen; draft ini bukan event aktif dan tidak dapat dipulihkan."
				action={
					<Button
						variant="outline"
						aria-expanded={open}
						aria-controls="deleted-draft-history"
						onClick={() => setOpen(!open)}
					>
						{open ? "Tutup riwayat" : "Lihat draft dihapus"}
					</Button>
				}
			/>
			<CardContent
				id="deleted-draft-history"
				hidden={!open}
				className="space-y-4"
			>
				{open && (
					<div className="space-y-4">
						{query.isPending && <p role="status">Memuat riwayat…</p>}
						{query.error && (
							<div role="alert">
								<p>{eventErrorMessage(query.error)}</p>
								<Button
									variant="outline"
									disabled={query.isFetching}
									onClick={() => query.refetch()}
								>
									Coba kembali
								</Button>
							</div>
						)}
						{!query.error && query.data && (
							<>
								{query.data.items.length === 0 && (
									<p className="text-muted-foreground text-sm">
										Belum ada draft yang dihapus.
									</p>
								)}
								<ol className="space-y-4">
									{query.data.items.map((item) => (
										<li
											key={item.id}
											className="space-y-2 rounded-lg border border-border p-4 text-sm"
										>
											<p className="break-words font-semibold">{item.title}</p>
											<p className="break-all text-muted-foreground">
												UUID event: {item.eventId}
											</p>
											<p>
												Jadwal: {formatEventTime(item.startsAt)} –{" "}
												{formatEventTime(item.endsAt)}
											</p>
											<p>
												Dihapus oleh {item.operator} ·{" "}
												{formatEventTime(item.createdAt)}
											</p>
											<p className="whitespace-pre-wrap break-words">
												Alasan: {item.reason}
											</p>
										</li>
									))}
								</ol>
							</>
						)}
						<div className="flex flex-wrap items-center gap-3">
							<Button
								variant="outline"
								disabled={offset === 0 || query.isFetching}
								onClick={() => setOffset(Math.max(0, offset - 20))}
							>
								Sebelumnya
							</Button>
							<span className="text-sm">Halaman {offset / 20 + 1}</span>
							<Button
								variant="outline"
								disabled={
									!query.data?.hasMore || !!query.error || query.isFetching
								}
								onClick={() => setOffset(offset + 20)}
							>
								Berikutnya
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
