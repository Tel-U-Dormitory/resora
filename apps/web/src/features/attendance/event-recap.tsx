"use client";

import type { AppRouter } from "@resora/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { queryClient, trpc } from "@/utils/trpc";
import { eventErrorMessage, formatEventTime, StatusBadge } from "./event-ui";

type Participant =
	inferRouterOutputs<AppRouter>["attendance"]["recap"]["participants"][number];
const fieldClass =
	"focus-ring w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
function manualError(error: unknown) {
	if (error instanceof TRPCClientError) {
		const messages: Record<string, string> = {
			ATTENDANCE_ALREADY_RECORDED:
				"Peserta sudah tercatat. Muat ulang dan gunakan koreksi.",
			MANUAL_TARGET_INACTIVE_OR_INELIGIBLE:
				"Akun peserta tidak aktif atau tidak eligible. Kehadiran baru tidak dapat ditambahkan.",
			CLOSED_EFFECTIVE_TIME_REQUIRED:
				"Pilih waktu kehadiran untuk event yang sudah ditutup.",
			ATTENDANCE_AFTER_CLOSURE:
				"Waktu kehadiran tidak boleh melewati waktu penutupan event.",
			ATTENDANCE_TIME_INVALID:
				"Waktu kehadiran tidak boleh berada di masa depan.",
			MANUAL_LIFECYCLE_INVALID:
				"Status event tidak mengizinkan perubahan kehadiran.",
			NOT_INVITED: "Peserta tidak ada dalam daftar undangan event.",
		};
		if (messages[error.message]) return messages[error.message];
	}
	return eventErrorMessage(error);
}

function ParticipantAudit({
	eventId,
	participant,
}: {
	eventId: string;
	participant: Participant;
}) {
	const [offset, setOffset] = useState(0);
	const history = useQuery({
		...trpc.attendance.auditHistory.queryOptions({
			eventId,
			userId: participant.userId,
			offset,
			limit: 20,
		}),
		retry: false,
	});
	return (
		<section className="space-y-3" aria-label={`Audit ${participant.name}`}>
			<h3 className="font-semibold">
				Audit: {participant.name} ({participant.nim})
			</h3>
			{history.isPending && <p role="status">Memuat audit…</p>}
			{history.error && <p role="alert">{manualError(history.error)}</p>}
			{history.data?.items.length === 0 && <p>Belum ada perubahan manual.</p>}
			{history.data?.items.map((item) => (
				<article
					key={item.id}
					className="space-y-1 rounded-lg border border-border p-3 text-sm"
				>
					<p className="font-semibold">
						{item.action === "MANUAL_CREATED"
							? "Kehadiran manual ditambahkan"
							: "Kehadiran dikoreksi"}
					</p>
					<p>
						{item.operator} · {formatEventTime(item.createdAt)}
					</p>
					<p className="whitespace-pre-wrap break-words">
						Alasan: {item.reason}
					</p>
					{item.before && (
						<p>
							Sebelum: {formatEventTime(item.before.attendanceAt)} ·{" "}
							{item.before.timingClass}
						</p>
					)}
					<p>
						Sesudah: {formatEventTime(item.after.attendanceAt)} ·{" "}
						{item.after.timingClass}
					</p>
				</article>
			))}
			<div className="flex gap-2">
				<Button
					variant="outline"
					disabled={offset === 0 || history.isFetching}
					onClick={() => setOffset(Math.max(0, offset - 20))}
				>
					Sebelumnya
				</Button>
				<Button
					variant="outline"
					disabled={history.data?.nextOffset == null || history.isFetching}
					onClick={() => {
						if (history.data?.nextOffset != null)
							setOffset(history.data.nextOffset);
					}}
				>
					Berikutnya
				</Button>
			</div>
		</section>
	);
}

function ManualForm({
	eventId,
	participant,
	closed,
	closedAt,
	onDone,
	onCancel,
}: {
	eventId: string;
	participant: Participant;
	closed: boolean;
	closedAt: string | null;
	onDone: () => Promise<void>;
	onCancel: () => void;
}) {
	const [time, setTime] = useState(
		participant.attendanceAt
			? new Date(new Date(participant.attendanceAt).getTime() + 7 * 3600_000)
					.toISOString()
					.slice(0, 19)
			: "",
	);
	const [reason, setReason] = useState("");
	const [error, setError] = useState("");
	const insert = useMutation(trpc.attendance.manualInsert.mutationOptions());
	const correct = useMutation(trpc.attendance.manualCorrect.mutationOptions());
	const busy = insert.isPending || correct.isPending;
	return (
		<form
			className="space-y-4 rounded-lg border border-border p-4"
			onSubmit={async (event) => {
				event.preventDefault();
				if (busy) return;
				setError("");
				if (!reason.trim()) {
					setError("Alasan wajib diisi.");
					return;
				}
				if (!time && (closed || participant.attendanceId)) {
					setError("Pilih waktu efektif kehadiran.");
					return;
				}
				try {
					const attendanceAt = time
						? new Date(`${time}+07:00`).toISOString()
						: undefined;
					if (participant.attendanceId && attendanceAt)
						await correct.mutateAsync({
							attendanceId: participant.attendanceId,
							attendanceAt,
							reason,
						});
					else
						await insert.mutateAsync({
							eventId,
							userId: participant.userId,
							attendanceAt,
							reason,
						});
					await onDone();
				} catch (cause) {
					setError(manualError(cause));
				}
			}}
		>
			<h3 className="font-semibold">
				{participant.attendanceId
					? "Koreksi kehadiran"
					: "Tambah kehadiran manual"}
				: {participant.name}
			</h3>
			<p className="text-muted-foreground text-sm">
				NIM {participant.nim} · {participant.departmentCode} /{" "}
				{participant.positionCode} · {participant.buildingName}
			</p>
			<div className="space-y-1">
				<label htmlFor="manual-effective-time" className="font-medium text-sm">
					Waktu efektif (WIB)
				</label>
				<input
					id="manual-effective-time"
					className={fieldClass}
					type="datetime-local"
					step="1"
					value={time}
					required={closed || Boolean(participant.attendanceId)}
					disabled={busy}
					onChange={(event) => setTime(event.target.value)}
				/>
				<p className="text-muted-foreground text-xs">
					{closed
						? `Wajib dipilih; paling lambat ${closedAt ? formatEventTime(closedAt) : "waktu penutupan"}.`
						: "Kosongkan untuk menggunakan waktu server saat ini pada input baru."}
				</p>
			</div>
			<div className="space-y-1">
				<label htmlFor="manual-reason" className="font-medium text-sm">
					Alasan {participant.attendanceId ? "koreksi" : "kehadiran manual"}
				</label>
				<textarea
					id="manual-reason"
					className={fieldClass}
					required
					maxLength={2000}
					value={reason}
					disabled={busy}
					onChange={(event) => setReason(event.target.value)}
				/>
			</div>
			<p className="text-muted-foreground text-sm">
				Perubahan dicatat dalam audit. Koreksi mempertahankan sumber dan bukti
				pencatatan asli.
			</p>
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<div className="flex gap-3">
				<Button type="submit" loading={busy}>
					Simpan kehadiran
				</Button>
				<Button variant="outline" disabled={busy} onClick={onCancel}>
					Batal
				</Button>
			</div>
		</form>
	);
}

export default function EventRecap({ eventId }: { eventId: string }) {
	const recap = useQuery({
		...trpc.attendance.recap.queryOptions({ eventId }),
		retry: false,
	});
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Participant | null>(null);
	const [audit, setAudit] = useState<Participant | null>(null);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [exporting, setExporting] = useState(false);
	if (recap.isPending) return <p role="status">Memuat rekap kehadiran…</p>;
	if (recap.error) return <p role="alert">{eventErrorMessage(recap.error)}</p>;
	const { participants, counts, canManual, event } = recap.data;
	const filtered = participants.filter((row) =>
		`${row.name} ${row.nim}`.toLowerCase().includes(search.toLowerCase()),
	);
	return (
		<Card>
			<CardHeader
				title="Rekap kehadiran"
				description="Seluruh undangan, menggunakan identitas saat publikasi."
			/>
			<CardContent className="space-y-5">
				<p className="text-sm">
					Undangan: {counts.invited} · Hadir: {counts.present} · Belum hadir:{" "}
					{counts.pending} · Tidak hadir: {counts.absent}
				</p>
				<div className="flex flex-wrap items-end gap-3">
					<div className="min-w-0 flex-1 space-y-1">
						<label htmlFor="attendance-search" className="text-sm">
							Cari nama atau NIM
						</label>
						<input
							id="attendance-search"
							className={fieldClass}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<Button
						variant="outline"
						loading={exporting}
						onClick={async () => {
							setExporting(true);
							setError("");
							try {
								const csv = await queryClient.fetchQuery({
									...trpc.attendance.exportCsv.queryOptions({ eventId }),
									staleTime: 0,
								});
								const url = URL.createObjectURL(
									new Blob([csv.content], { type: "text/csv;charset=utf-8" }),
								);
								const link = document.createElement("a");
								link.href = url;
								link.download = csv.filename;
								link.click();
								URL.revokeObjectURL(url);
							} catch (cause) {
								setError(eventErrorMessage(cause));
							} finally {
								setExporting(false);
							}
						}}
					>
						Export CSV
					</Button>
				</div>
				{message && (
					<p role="status" className="text-sm text-success">
						{message}
					</p>
				)}
				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}
				{selected && canManual && (
					<ManualForm
						key={selected.userId}
						eventId={eventId}
						participant={selected}
						closed={event.status === "CLOSED"}
						closedAt={event.closedAt}
						onCancel={() => setSelected(null)}
						onDone={async () => {
							setSelected(null);
							setMessage("Kehadiran berhasil disimpan dan diaudit.");
							await queryClient.invalidateQueries({
								queryKey: trpc.attendance.pathKey(),
							});
						}}
					/>
				)}
				<div className="overflow-x-auto rounded-lg border border-border">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">
							Rekap seluruh peserta undangan
						</caption>
						<thead>
							<tr className="border-border border-b bg-muted/50">
								{[
									"Peserta",
									"Organisasi",
									"Presence",
									"Waktu (WIB)",
									"Timing / Terlambat",
									"Sumber",
									...(canManual ? ["Tindakan"] : []),
								].map((label) => (
									<th key={label} scope="col" className="p-3">
										{label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{filtered.map((row) => (
								<tr
									key={row.userId}
									className="border-border border-b last:border-0"
								>
									<td className="p-3">
										<p className="font-medium">{row.name}</p>
										<p>{row.nim}</p>
									</td>
									<td className="p-3">
										{row.departmentCode} / {row.positionCode}
										<br />
										{row.buildingName}
									</td>
									<td className="p-3">
										<StatusBadge status={row.presence} />
									</td>
									<td className="whitespace-nowrap p-3">
										{row.attendanceAt ? formatEventTime(row.attendanceAt) : "—"}
									</td>
									<td className="p-3">
										{row.timingClass ?? "—"}
										{row.lateMinutes !== null && <p>{row.lateMinutes} menit</p>}
									</td>
									<td className="p-3">{row.source ?? "—"}</td>
									{canManual && (
										<td className="space-y-2 p-3">
											<Button
												size="sm"
												variant="outline"
												onClick={() => {
													setSelected(row);
													setMessage("");
												}}
											>
												{row.attendanceId ? "Koreksi" : "Input manual"}
											</Button>
											{row.attendanceId && (
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setAudit(row)}
												>
													Audit
												</Button>
											)}
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{filtered.length === 0 && (
					<p className="text-muted-foreground text-sm">
						Tidak ada peserta yang sesuai.
					</p>
				)}
				{audit && canManual && (
					<div className="space-y-3">
						<Button variant="ghost" onClick={() => setAudit(null)}>
							Tutup audit
						</Button>
						<ParticipantAudit
							key={audit.userId}
							eventId={eventId}
							participant={audit}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
