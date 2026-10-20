"use client";

import type { AppRouter } from "@resora/api/routers/index";
import { DateTimePicker } from "@resora/ui/components/date-time-picker";
import { Input } from "@resora/ui/components/input";
import { Skeleton } from "@resora/ui/components/skeleton";
import { Textarea } from "@resora/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { AlertCircle, CalendarDays, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { refreshAttendanceQueries } from "./attendance-queries";
import {
	DORM_HALL,
	EventLocationPicker,
	type LocationPoint,
} from "./event-location-picker";
import {
	eventErrorMessage,
	formatEventSchedule,
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
	"aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";
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
		...DORM_HALL,
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
			advancedMode={advancedMode}
			eventId={eventId}
			candidates={directory.data?.candidates ?? []}
			invalidCount={directory.data?.invalidAssignmentCount ?? 0}
		/>
	);
}
function DraftEditor({
	initial,
	advancedMode,
	eventId,
	candidates,
	invalidCount,
}: {
	initial: Draft;
	advancedMode?: "FULL" | "LIMITED" | "METADATA";
	eventId?: string;
	candidates: RosterCandidate[];
	invalidCount: number;
}) {
	const [draft, setDraft] = useState(initial);
	const submitLock = useRef(false);
	const setLocation = useCallback((point: LocationPoint) => {
		if (submitLock.current) return;
		setDraft((current) => ({
			...current,
			session: { ...current.session, ...point },
		}));
	}, []);
	const [start, setStart] = useState(
		initial.startsAt ? toWibDateTimeInput(initial.startsAt) : "",
	);
	const [end, setEnd] = useState(
		initial.endsAt ? toWibDateTimeInput(initial.endsAt) : "",
	);
	const [error, setError] = useState("");
	const [reason, setReason] = useState("");
	const fullEditing = !advancedMode || advancedMode === "FULL";
	const editorTitle = advancedMode
		? "Edit event"
		: eventId
			? "Edit draft"
			: "Buat event";
	const [endError, setEndError] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [saving, setSaving] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);
	const errorRef = useRef<HTMLDivElement>(null);
	const [invalidFieldId, setInvalidFieldId] = useState("");
	useEffect(() => {
		if (error || endError) errorRef.current?.focus();
	}, [error, endError]);
	const router = useRouter();
	const create = useMutation(trpc.attendance.create.mutationOptions());
	const edit = useMutation(trpc.attendance.editDraft.mutationOptions());
	const advanced = useMutation(trpc.attendance.advancedEdit.mutationOptions());
	const criteria = draft.rosterCriteria ?? empty.rosterCriteria;
	const session = draft.session;
	if (!criteria) return null;
	const candidatePage = participantPage(candidates, search, page);
	const invitedCount = new Set(
		candidates.filter((sr) => isInvited(sr, criteria)).map((sr) => sr.userId),
	).size;
	return (
		<section className="resora-page min-w-0 space-y-6">
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
							{editorTitle}
						</span>
					</li>
				</ol>
			</nav>
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">{editorTitle}</h1>
				<p className="text-muted-foreground text-sm">
					{advancedMode
						? "Perubahan administratif memerlukan alasan dan dicatat dalam audit. Field yang tersedia mengikuti status event dan kehadiran terkini."
						: "Siapkan informasi event dan undangan. Peserta dapat ditinjau setelah draft disimpan."}
				</p>
			</div>
			<form
				ref={formRef}
				aria-busy={saving}
				className="resora-event-form space-y-5"
				onSubmitCapture={() => setInvalidFieldId("")}
				onChangeCapture={(event) => {
					if (invalidFieldId && event.target.id === invalidFieldId) {
						setInvalidFieldId("");
						setError("");
					}
				}}
				onInvalidCapture={(event) => {
					event.preventDefault();
					setEndError("");
					const field = formRef.current?.querySelector<
						HTMLInputElement | HTMLTextAreaElement
					>("input:invalid, textarea:invalid");
					const details = field?.closest("details");
					if (details) details.open = true;
					setInvalidFieldId(field?.id ?? "");
					setError(field?.validationMessage || "Periksa kembali isian form.");
				}}
				onSubmit={async (event) => {
					event.preventDefault();
					if (submitLock.current) return;
					setError("");
					setEndError("");
					if (advancedMode && !reason.trim()) {
						setError("Alasan perubahan administratif wajib diisi.");
						return;
					}
					const startDate =
						advancedMode && start === toWibDateTimeInput(initial.startsAt)
							? new Date(initial.startsAt)
							: parseWibDateTimeInput(start);
					const endDate =
						advancedMode && end === toWibDateTimeInput(initial.endsAt)
							? new Date(initial.endsAt)
							: parseWibDateTimeInput(end);
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
						if (eventId && advancedMode) {
							if (advancedMode === "FULL")
								await advanced.mutateAsync({
									eventId,
									mode: "FULL",
									draft: input,
									reason,
								});
							else
								await advanced.mutateAsync({
									eventId,
									mode: "LIMITED",
									title: draft.title,
									description: draft.description ?? "",
									reason,
									...(advancedMode === "LIMITED" &&
									end !== toWibDateTimeInput(initial.endsAt)
										? { endsAt: input.endsAt }
										: {}),
								});
						} else if (eventId)
							await edit.mutateAsync({ eventId, draft: input });
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
				{(error || endError) && (
					<div
						ref={errorRef}
						id="event-form-error"
						tabIndex={-1}
						role="alert"
						className="focus-ring scroll-mt-24 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm outline-none"
					>
						<p className="flex items-center gap-2 font-semibold">
							<AlertCircle className="size-4 shrink-0" aria-hidden="true" />
							Periksa form sebelum menyimpan
						</p>
						<p className="mt-2">{error || endError}</p>
						{(endError || invalidFieldId) && (
							<a
								className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
								href={`#${endError ? "event-end" : invalidFieldId}`}
								onClick={(event) => {
									event.preventDefault();
									const field = document.getElementById(
										endError ? "event-end" : invalidFieldId,
									);
									const details = field?.closest("details");
									if (details) details.open = true;
									field?.focus();
									field?.scrollIntoView({ block: "center" });
								}}
							>
								Perbaiki isian
							</a>
						)}
					</div>
				)}
				<fieldset disabled={saving} className="min-w-0 space-y-5">
					<legend className="sr-only">Informasi dan pengaturan event</legend>
					<Card>
						<div className="border-border border-b p-5">
							<h2 className="font-semibold text-base">Informasi event</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								Judul dan deskripsi yang akan dilihat peserta.
							</p>
						</div>
						<CardContent className="grid min-w-0 grid-cols-1 gap-5">
							<label
								htmlFor="event-title"
								className="block min-w-0 font-medium text-sm"
							>
								Judul event{" "}
								<span className="text-muted-foreground text-xs">(wajib)</span>
								<Input
									id="event-title"
									aria-invalid={invalidFieldId === "event-title" || undefined}
									aria-describedby={
										invalidFieldId === "event-title"
											? "event-form-error"
											: undefined
									}
									placeholder="Contoh: Rapat koordinasi bulanan"
									required
									maxLength={200}
									className={fieldClass}
									value={draft.title}
									onChange={(e) =>
										setDraft({ ...draft, title: e.target.value })
									}
								/>
							</label>
							<label
								htmlFor="event-description"
								className="block min-w-0 font-medium text-sm"
							>
								Deskripsi{" "}
								<span className="text-muted-foreground text-xs">
									(opsional)
								</span>
								<Textarea
									id="event-description"
									aria-invalid={
										invalidFieldId === "event-description" || undefined
									}
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
					{advancedMode !== "METADATA" && (
						<Card>
							<div className="border-border border-b p-5">
								<h2 className="flex items-center gap-2 font-semibold text-base">
									<CalendarDays
										className="size-4 text-muted-foreground"
										aria-hidden="true"
									/>{" "}
									Jadwal
								</h2>
								<p className="mt-1 text-muted-foreground text-sm">
									Isi waktu mulai dan selesai dalam WIB.
								</p>
							</div>
							<CardContent className="grid gap-4 sm:grid-cols-2">
								{fullEditing && (
									<div className="text-sm">
										<label htmlFor="event-start" className="font-medium">
											Waktu mulai (WIB)
										</label>
										<DateTimePicker
											label="Waktu mulai"
											id="event-start"
											aria-invalid={
												invalidFieldId === "event-start" || undefined
											}
											required
											disabled={saving}
											className={fieldClass}
											value={start}
											onChange={(value) => {
												setStart(value);
												setEndError("");
											}}
										/>
									</div>
								)}
								<div className="text-sm">
									<label htmlFor="event-end" className="font-medium">
										Waktu selesai (WIB)
									</label>
									<DateTimePicker
										label="Waktu selesai"
										required
										disabled={saving}
										id="event-end"
										aria-invalid={
											Boolean(endError) || invalidFieldId === "event-end"
										}
										aria-describedby={endError ? "event-end-error" : undefined}
										className={fieldClass}
										value={end}
										onChange={(value) => {
											setEnd(value);
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
								</div>
								{Number.isFinite(parseWibDateTimeInput(start).getTime()) &&
									Number.isFinite(parseWibDateTimeInput(end).getTime()) &&
									parseWibDateTimeInput(end) > parseWibDateTimeInput(start) && (
										<p className="text-muted-foreground text-xs sm:col-span-2">
											{formatEventSchedule(
												parseWibDateTimeInput(start).toISOString(),
												parseWibDateTimeInput(end).toISOString(),
											)}
										</p>
									)}
							</CardContent>
						</Card>
					)}
					{fullEditing && (
						<>
							<Card>
								<div className="border-border border-b p-5">
									<h2 className="flex items-center gap-2 font-semibold text-base">
										<MapPin
											className="size-4 text-muted-foreground"
											aria-hidden="true"
										/>{" "}
										Lokasi & kehadiran
									</h2>
									<p className="mt-1 text-muted-foreground text-sm">
										Tentukan lokasi kegiatan dan area check-in peserta.
									</p>
								</div>
								<CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<div className="sm:col-span-2 lg:col-span-3">
										<EventLocationPicker
											centerLat={session.centerLat}
											centerLng={session.centerLng}
											radius={session.geofenceRadiusM ?? 20}
											onChange={setLocation}
											disabled={saving}
										/>
									</div>
									<label
										htmlFor="event-geofenceRadiusM"
										className="block space-y-2 sm:col-span-2 lg:col-span-3"
									>
										Radius check-in (meter)
										<Input
											id="event-geofenceRadiusM"
											aria-invalid={
												invalidFieldId === "event-geofenceRadiusM" || undefined
											}
											required
											type="number"
											step={1}
											min={1}
											max={2147483647}
											className="max-w-xs"
											value={session.geofenceRadiusM ?? ""}
											onChange={(event) =>
												setDraft({
													...draft,
													session: {
														...session,
														geofenceRadiusM: Number(event.target.value),
													},
												})
											}
										/>
										<span className="block text-muted-foreground text-xs">
											Peserta harus berada dalam area ini untuk check-in. Lokasi
											tetap diperiksa oleh sistem.
										</span>
									</label>
									<details className="rounded-xl border border-border p-4 sm:col-span-2 lg:col-span-3">
										<summary className="focus-ring cursor-pointer rounded-md font-medium text-sm">
											Pengaturan kehadiran
											<span className="mt-1 block text-muted-foreground text-xs">
												Toleransi {session.lateGraceMinutes ?? 15} menit · QR
												berlaku {session.qrTtlMinutes ?? 360} menit
											</span>
										</summary>
										<div className="mt-4 grid gap-4 sm:grid-cols-2">
											{(
												[
													[
														"lateGraceMinutes",
														"Toleransi telat (menit)",
														0,
														2147483647,
													],
													[
														"qrTtlMinutes",
														"Masa berlaku QR (menit)",
														1,
														2147483647,
													],
												] as const
											).map(([key, label, min, max]) => (
												<label
													key={key}
													htmlFor={`event-${key}`}
													className="block min-w-0 font-medium text-sm"
												>
													{label}
													<Input
														id={`event-${key}`}
														aria-invalid={
															invalidFieldId === `event-${key}` || undefined
														}
														required
														type="number"
														step={1}
														min={min}
														max={max}
														className={fieldClass}
														value={session[key] ?? ""}
														onChange={(e) =>
															setDraft({
																...draft,
																session: {
																	...session,
																	[key]: Number(e.target.value),
																},
															})
														}
													/>
												</label>
											))}
										</div>
									</details>
								</CardContent>
							</Card>
							<section
								aria-labelledby="roster-heading"
								className="space-y-5 rounded-[1rem] border border-border bg-surface p-5 shadow-xs"
							>
								<h2
									id="roster-heading"
									className="flex items-center gap-2 font-semibold text-base"
								>
									<Users
										className="size-4 text-muted-foreground"
										aria-hidden="true"
									/>{" "}
									Peserta
								</h2>
								{advancedMode && (
									<p className="text-muted-foreground text-sm">
										Daftar ini menampilkan SR aktif terkini. Snapshot undangan
										yang sudah ada tetap dipertahankan jika kriteria peserta
										tidak diubah.
									</p>
								)}
								<p className="text-muted-foreground text-sm">
									Pilih kelompok, lalu tinjau peserta. Hapus centang untuk
									mengecualikan seseorang dari undangan.
								</p>
								<fieldset className="space-y-3">
									<legend className="mb-3 font-medium text-sm">
										Kelompok undangan
									</legend>
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
												className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
											>
												<input
													type="checkbox"
													checked={criteria[key] ?? false}
													onChange={(e) =>
														setDraft({
															...draft,
															rosterCriteria: {
																...criteria,
																[key]: e.target.checked,
															},
														})
													}
												/>
												{label}
											</label>
										))}
										<Button
											type="button"
											variant={
												criteria.inti && criteria.kadep
													? "secondary"
													: "outline"
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
												className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
											>
												<input
													type="checkbox"
													checked={
														criteria.departments?.includes(code) ?? false
													}
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
								</fieldset>
								<div className="border-border border-t pt-5">
									<h3 className="font-semibold text-sm">Tinjau peserta</h3>
									<p className="mt-1 text-muted-foreground text-xs">
										Pilihan individu menyesuaikan kelompok yang Anda pilih.
									</p>
								</div>
								{invalidCount > 0 && (
									<p role="alert">
										{invalidCount} akun tidak tersedia karena penempatan
										organisasi tidak valid. Hubungi pengelola akun.
									</p>
								)}
								<label
									htmlFor="form-field-2"
									className="block space-y-2 font-medium text-sm"
								>
									Cari peserta
									<Input
										id="form-field-2"
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
									{invitedCount}{" "}
									{advancedMode
										? "calon peserta berdasarkan kriteria"
										: "peserta diundang"}{" "}
									dari {candidates.length} SR aktif · {candidatePage.matching}{" "}
									hasil pencarian
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
														<span className="block break-words font-medium">
															{sr.name}
														</span>
														<span className="mt-1 block text-muted-foreground text-xs">
															{sr.nim} · {sr.departmentCode} / {sr.positionCode}
														</span>
													</td>
													<td className="p-3">
														<label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-ring">
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
														</label>
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
									{advancedMode
										? "Perubahan kriteria akan menyinkronkan undangan saat disimpan; snapshot peserta yang tetap diundang tidak ditulis ulang."
										: "Simpan draft untuk melihat preview seluruh undangan sebelum publikasi."}
								</p>
							</section>
						</>
					)}
					{advancedMode && (
						<label htmlFor="form-field-3" className="block space-y-2 text-sm">
							Alasan perubahan administratif
							<Textarea
								id="form-field-3"
								required
								maxLength={2000}
								className={fieldClass}
								value={reason}
								disabled={saving}
								onChange={(e) => setReason(e.target.value)}
							/>
						</label>
					)}
				</fieldset>
				<div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-md sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
					<div className="min-w-0 text-sm">
						<p className="font-semibold">
							{fullEditing
								? `${invitedCount} ${advancedMode ? "calon peserta" : "peserta dipilih"}`
								: "Perubahan event"}
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{advancedMode
								? "Perubahan dicatat dalam audit."
								: "Disimpan sebagai draft. Belum dipublikasikan."}
						</p>
					</div>
					<Button
						type="submit"
						className="w-full sm:w-auto"
						disabled={saving}
						loading={saving}
					>
						{saving
							? "Menyimpan perubahan…"
							: advancedMode
								? "Simpan perubahan"
								: eventId
									? "Simpan perubahan draft"
									: "Simpan draft"}
					</Button>
				</div>
			</form>
		</section>
	);
}
