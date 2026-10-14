"use client";

import type { AppRouter } from "@resora/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { refreshAttendanceQueries } from "./attendance-queries";
import {
	eventErrorMessage,
	parseWibDateTimeInput,
	toWibDateTimeInput,
} from "./event-ui";
import { participantPage } from "./participant-list";
import {
	isInvited,
	type RosterCandidate,
	setParticipantInvitation,
} from "./roster-selection";

const fieldClass =
	"focus-ring block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive";
const timeRangeMessage = "Waktu selesai harus lebih lambat dari waktu mulai.";

type Draft = inferRouterInputs<AppRouter>["attendance"]["create"];
const departments = [
	"INTI",
	"ADAPTIF",
	"SOSIAL",
	"AKADEMIK",
	"SPIRITUAL",
	"HCO",
	"MEDIA",
	"RND",
] as const;
const empty: Draft = {
	title: "",
	description: "",
	startsAt: "",
	endsAt: "",
	session: {
		centerLat: 0,
		centerLng: 0,
		geofenceRadiusM: 20,
		lateGraceMinutes: 15,
		qrTtlMinutes: 360,
	},
	rosterCriteria: {
		allSr: false,
		departments: [],
		inti: false,
		kadep: false,
		individuals: [],
		include: [],
		exclude: [],
	},
};

export default function EventForm({ eventId }: { eventId?: string }) {
	const directory = useQuery({
		...trpc.attendance.directory.queryOptions(),
		retry: false,
	});
	const detail = useQuery({
		...trpc.attendance.detail.queryOptions({
			eventId: eventId ?? "00000000-0000-0000-0000-000000000000",
		}),
		enabled: Boolean(eventId),
		retry: false,
	});
	if (directory.isPending || (eventId && detail.isPending))
		return (
			<p role="status" className="text-muted-foreground text-sm">
				Memuat formulir...
			</p>
		);
	if (directory.error || detail.error)
		return (
			<p role="alert" className="text-sm">
				Form tidak tersedia. Akses HCO dan sesi valid diperlukan.{" "}
				<Link href="/events">Kembali</Link>
			</p>
		);
	if (
		eventId &&
		(!detail.data?.canManage || detail.data.event.status !== "DRAFT")
	)
		return (
			<p role="alert" className="text-sm">
				Hanya draft dapat diedit.
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
			eventId={eventId}
			candidates={directory.data?.candidates ?? []}
			invalidCount={directory.data?.invalidAssignmentCount ?? 0}
		/>
	);
}
function DraftEditor({
	initial,
	eventId,
	candidates,
	invalidCount,
}: {
	initial: Draft;
	eventId?: string;
	candidates: RosterCandidate[];
	invalidCount: number;
}) {
	const [draft, setDraft] = useState(initial);
	const [start, setStart] = useState(
		initial.startsAt ? toWibDateTimeInput(initial.startsAt) : "",
	);
	const [end, setEnd] = useState(
		initial.endsAt ? toWibDateTimeInput(initial.endsAt) : "",
	);
	const [error, setError] = useState("");
	const [endError, setEndError] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [saving, setSaving] = useState(false);
	const submitLock = useRef(false);
	const router = useRouter();
	const create = useMutation(trpc.attendance.create.mutationOptions());
	const edit = useMutation(trpc.attendance.editDraft.mutationOptions());
	const criteria = draft.rosterCriteria ?? empty.rosterCriteria;
	const session = draft.session;
	if (!criteria) return null;
	const candidatePage = participantPage(candidates, search, page);
	const invitedCount = new Set(
		candidates.filter((sr) => isInvited(sr, criteria)).map((sr) => sr.userId),
	).size;
	return (
		<section className="min-w-0 space-y-6">
			<nav aria-label="Breadcrumb event" className="text-sm">
				<ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<li>
						<Link
							className="focus-ring rounded-md text-muted-foreground hover:text-primary"
							href="/events?view=manage"
						>
							Kelola event
						</Link>
					</li>
					<li aria-hidden="true" className="text-muted-foreground">
						/
					</li>
					<li className="min-w-0">
						<span aria-current="page" className="block truncate font-medium">
							{eventId ? "Edit draft" : "Buat event"}
						</span>
					</li>
				</ol>
			</nav>
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">
					{eventId ? "Edit draft" : "Buat event"}
				</h1>
				<p className="text-muted-foreground text-sm">
					Siapkan informasi event dan undangan. Peserta dapat ditinjau setelah
					draft disimpan.
				</p>
			</div>
			<form
				className="space-y-5"
				onSubmit={async (event) => {
					event.preventDefault();
					if (submitLock.current) return;
					setError("");
					setEndError("");
					const startDate = parseWibDateTimeInput(start);
					const endDate = parseWibDateTimeInput(end);
					if (
						!Number.isFinite(startDate.getTime()) ||
						!Number.isFinite(endDate.getTime())
					) {
						setEndError("Isi waktu mulai dan selesai yang valid.");
						return;
					}
					if (endDate <= startDate) {
						setEndError(timeRangeMessage);
						return;
					}
					submitLock.current = true;
					setSaving(true);
					let saved = false;
					try {
						const input = {
							...draft,
							startsAt: startDate.toISOString(),
							endsAt: endDate.toISOString(),
						};
						const id = eventId ?? (await create.mutateAsync(input)).eventId;
						if (eventId) await edit.mutateAsync({ eventId, draft: input });
						saved = true;
						await refreshAttendanceQueries(
							queryClient,
							attendanceQueryKeys,
						).catch(() => {});
						router.push(`/events/${id}`);
					} catch (cause) {
						if (
							cause instanceof Error &&
							cause.message.includes("Event end must follow start")
						)
							setEndError(timeRangeMessage);
						else setError(eventErrorMessage(cause));
					} finally {
						if (!saved) {
							submitLock.current = false;
							setSaving(false);
						}
					}
				}}
			>
				<Card>
					<div className="border-border border-b p-5">
						<h2 className="font-semibold">Informasi event</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Judul dan deskripsi yang akan dilihat peserta.
						</p>
					</div>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<label>
							Judul
							<input
								required
								maxLength={200}
								className={fieldClass}
								value={draft.title}
								onChange={(e) => setDraft({ ...draft, title: e.target.value })}
							/>
						</label>
						<label>
							Deskripsi
							<textarea
								className={fieldClass}
								maxLength={5000}
								value={draft.description}
								onChange={(e) =>
									setDraft({ ...draft, description: e.target.value })
								}
							/>
						</label>
					</CardContent>
				</Card>
				<Card>
					<div className="border-border border-b p-5">
						<h2 className="font-semibold">Jadwal</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Isi waktu mulai dan selesai dalam WIB.
						</p>
					</div>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<label>
							Waktu mulai (WIB)
							<input
								required
								type="datetime-local"
								className={fieldClass}
								value={start}
								onChange={(e) => {
									setStart(e.target.value);
									setEndError("");
								}}
							/>
						</label>
						<label>
							Waktu selesai (WIB)
							<input
								required
								type="datetime-local"
								id="event-end"
								aria-invalid={Boolean(endError)}
								aria-describedby={endError ? "event-end-error" : undefined}
								className={fieldClass}
								value={end}
								onChange={(e) => {
									setEnd(e.target.value);
									setEndError("");
								}}
							/>
							{endError && (
								<p
									id="event-end-error"
									className="mt-2 text-destructive text-sm"
									role="alert"
								>
									{endError}
								</p>
							)}
						</label>
					</CardContent>
				</Card>
				<Card>
					<div className="border-border border-b p-5">
						<h2 className="font-semibold">Lokasi dan QR</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Atur titik pusat, radius lokasi, toleransi keterlambatan, dan masa
							berlaku QR.
						</p>
					</div>
					<CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{(
							[
								["centerLat", "Latitude pusat", -90, 90],
								["centerLng", "Longitude pusat", -180, 180],
								["geofenceRadiusM", "Radius (meter)", 1, undefined],
								["lateGraceMinutes", "Toleransi telat (menit)", 0, undefined],
								["qrTtlMinutes", "Masa berlaku QR (menit)", 1, undefined],
							] as const
						).map(([key, label, min, max]) => (
							<label key={key}>
								{label}
								<input
									required
									type="number"
									step={key === "centerLat" || key === "centerLng" ? "any" : 1}
									min={min}
									max={max}
									className={fieldClass}
									value={session[key] ?? ""}
									onChange={(e) =>
										setDraft({
											...draft,
											session: { ...session, [key]: Number(e.target.value) },
										})
									}
								/>
							</label>
						))}
					</CardContent>
				</Card>
				<section
					aria-labelledby="roster-heading"
					className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xs"
				>
					<h2 id="roster-heading" className="font-semibold">
						Pemilihan peserta
					</h2>
					<p className="text-muted-foreground text-sm">
						Gabungkan beberapa kelompok atau pilih peserta satu per satu.
						Centang Diundang untuk menyertakan peserta, atau hapus centang untuk
						mengecualikannya dari kelompok yang dipilih. Peserta hanya diundang
						sekali.
					</p>
					<div className="flex flex-wrap items-center gap-3">
						{(
							[
								["allSr", "Semua SR aktif"],
								["inti", "INTI"],
								["kadep", "KADEP lintas departemen"],
							] as const
						).map(([key, label]) => (
							<label
								key={key}
								className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
							>
								<input
									type="checkbox"
									checked={criteria[key] ?? false}
									onChange={(e) =>
										setDraft({
											...draft,
											rosterCriteria: { ...criteria, [key]: e.target.checked },
										})
									}
								/>
								{label}
							</label>
						))}
						<Button
							type="button"
							variant={
								criteria.inti && criteria.kadep ? "secondary" : "outline"
							}
							aria-pressed={Boolean(criteria.inti && criteria.kadep)}
							onClick={() =>
								setDraft({
									...draft,
									rosterCriteria: {
										...criteria,
										inti: !(criteria.inti && criteria.kadep),
										kadep: !(criteria.inti && criteria.kadep),
									},
								})
							}
						>
							INTI + KADEP
						</Button>
					</div>
					<p className="font-semibold text-sm">Departemen</p>
					<div className="flex flex-wrap gap-3">
						{departments.map((code) => (
							<label
								key={code}
								className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
							>
								<input
									type="checkbox"
									checked={criteria.departments?.includes(code) ?? false}
									onChange={(e) =>
										setDraft({
											...draft,
											rosterCriteria: {
												...criteria,
												departments: e.target.checked
													? [...(criteria.departments ?? []), code]
													: criteria.departments?.filter(
															(value) => value !== code,
														),
											},
										})
									}
								/>
								{code}
							</label>
						))}
					</div>
					{invalidCount > 0 && (
						<p role="alert">
							{invalidCount} akun tidak tersedia karena penempatan organisasi
							tidak valid. Hubungi pengelola akun.
						</p>
					)}
					<label className="block space-y-2 font-medium text-sm">
						Cari peserta
						<input
							type="search"
							className={fieldClass}
							placeholder="Cari nama atau NIM"
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
						/>
					</label>
					<p className="text-muted-foreground text-sm" role="status">
						{invitedCount} peserta diundang dari {candidates.length} SR aktif ·{" "}
						{candidatePage.matching} hasil pencarian
					</p>
					<div className="overflow-x-auto rounded-lg border border-border">
						<table className="w-full text-left text-sm">
							<caption className="sr-only">
								Daftar SR aktif untuk pilihan peserta individu
							</caption>
							<thead>
								<tr className="border-border border-b bg-muted/50">
									<th scope="col" className="p-3">
										Peserta
									</th>
									<th scope="col" className="p-3">
										Diundang
									</th>
								</tr>
							</thead>
							<tbody>
								{candidatePage.matching === 0 && (
									<tr>
										<td
											colSpan={2}
											className="p-6 text-center text-muted-foreground"
										>
											Tidak ada peserta yang cocok.
										</td>
									</tr>
								)}
								{candidatePage.rows.map((sr) => (
									<tr
										key={sr.userId}
										className="border-border border-b last:border-0 hover:bg-muted/30"
									>
										<td className="p-3">
											{sr.nim} · {sr.name} ({sr.departmentCode}/
											{sr.positionCode})
										</td>
										<td className="p-3">
											<input
												type="checkbox"
												className="focus-ring size-4 accent-primary"
												aria-label={`Diundang: ${sr.name} ${sr.nim}`}
												checked={isInvited(sr, criteria)}
												onChange={(e) =>
													setDraft({
														...draft,
														rosterCriteria: setParticipantInvitation(
															criteria,
															sr,
															e.target.checked,
														),
													})
												}
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							Halaman {candidatePage.page} dari {candidatePage.pages}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={candidatePage.page === 1}
								onClick={() => setPage(candidatePage.page - 1)}
							>
								Sebelumnya
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={candidatePage.page === candidatePage.pages}
								onClick={() => setPage(candidatePage.page + 1)}
							>
								Berikutnya
							</Button>
						</div>
					</div>
					<p className="text-muted-foreground text-sm">
						Simpan draft untuk melihat preview seluruh undangan sebelum
						publikasi.
					</p>
				</section>
				{error && (
					<p
						className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm"
						role="alert"
					>
						{error}
					</p>
				)}
				<Button type="submit" disabled={saving} loading={saving}>
					{saving ? "Menyimpan draft…" : "Simpan draft"}
				</Button>
			</form>
		</section>
	);
}
