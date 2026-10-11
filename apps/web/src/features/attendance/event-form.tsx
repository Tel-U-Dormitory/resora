"use client";

import type { AppRouter } from "@resora/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryClient, trpc } from "@/utils/trpc";

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
			<p role="status" className="p-6">
				Memuat formulir...
			</p>
		);
	if (directory.error || detail.error)
		return (
			<p role="alert" className="p-6">
				Form tidak tersedia. Akses HCO dan sesi valid diperlukan.{" "}
				<Link href="/events">Kembali</Link>
			</p>
		);
	if (
		eventId &&
		(!detail.data?.canManage || detail.data.event.status !== "DRAFT")
	)
		return (
			<p role="alert" className="p-6">
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
type Candidate = {
	userId: string;
	nim: string;
	name: string;
	departmentCode: string;
	positionCode: string;
};
function DraftEditor({
	initial,
	eventId,
	candidates,
	invalidCount,
}: {
	initial: Draft;
	eventId?: string;
	candidates: Candidate[];
	invalidCount: number;
}) {
	const [draft, setDraft] = useState(initial);
	const [start, setStart] = useState(
		initial.startsAt ? localDateTime(initial.startsAt) : "",
	);
	const [end, setEnd] = useState(
		initial.endsAt ? localDateTime(initial.endsAt) : "",
	);
	const [error, setError] = useState("");
	const router = useRouter();
	const create = useMutation(trpc.attendance.create.mutationOptions());
	const edit = useMutation(trpc.attendance.editDraft.mutationOptions());
	const criteria = draft.rosterCriteria ?? empty.rosterCriteria;
	const session = draft.session;
	if (!criteria) return null;
	const toggle = (
		key: "individuals" | "include" | "exclude",
		id: string,
		checked: boolean,
	) =>
		setDraft({
			...draft,
			rosterCriteria: {
				...criteria,
				[key]: checked
					? [...(criteria[key] ?? []), id]
					: (criteria[key] ?? []).filter((value) => value !== id),
			},
		});
	return (
		<main className="mx-auto max-w-5xl space-y-5 p-6">
			<Link className="focus-ring text-primary underline" href="/events">
				Daftar event
			</Link>
			<h1 className="font-semibold text-2xl">
				{eventId ? "Edit draft" : "Draft event baru"}
			</h1>
			<form
				className="space-y-5"
				onSubmit={async (event) => {
					event.preventDefault();
					setError("");
					try {
						const input = {
							...draft,
							startsAt: new Date(start).toISOString(),
							endsAt: new Date(end).toISOString(),
						};
						const id = eventId ?? (await create.mutateAsync(input)).eventId;
						if (eventId) await edit.mutateAsync({ eventId, draft: input });
						await queryClient.invalidateQueries({
							queryKey: trpc.attendance.pathKey(),
						});
						router.push(`/events/${id}`);
					} catch (cause) {
						setError(
							cause instanceof Error ? cause.message : "Draft gagal disimpan",
						);
					}
				}}
			>
				<Card>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<label>
							Judul
							<input
								required
								maxLength={200}
								className="focus-ring block w-full rounded border p-2"
								value={draft.title}
								onChange={(e) => setDraft({ ...draft, title: e.target.value })}
							/>
						</label>
						<label>
							Deskripsi
							<textarea
								className="focus-ring block w-full rounded border p-2"
								maxLength={5000}
								value={draft.description}
								onChange={(e) =>
									setDraft({ ...draft, description: e.target.value })
								}
							/>
						</label>
						<label>
							Mulai (waktu lokal perangkat)
							<input
								required
								type="datetime-local"
								className="focus-ring block rounded border p-2"
								value={start}
								onChange={(e) => setStart(e.target.value)}
							/>
						</label>
						<label>
							Selesai (waktu lokal perangkat)
							<input
								required
								type="datetime-local"
								className="focus-ring block rounded border p-2"
								value={end}
								onChange={(e) => setEnd(e.target.value)}
							/>
						</label>
						{(
							[
								["centerLat", "Latitude pusat", -90, 90],
								["centerLng", "Longitude pusat", -180, 180],
								["geofenceRadiusM", "Radius (meter)", 1, undefined],
								["lateGraceMinutes", "Toleransi telat (menit)", 0, undefined],
								["qrTtlMinutes", "QR TTL (menit)", 1, undefined],
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
									className="focus-ring block rounded border p-2"
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
				<fieldset className="space-y-3 rounded border p-4">
					<legend className="font-semibold">
						Roster undangan (UNION, exclude didahulukan)
					</legend>
					{(
						[
							["allSr", "Semua SR aktif"],
							["inti", "INTI"],
							["kadep", "Semua KADEP non-INTI"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="mr-4 inline-flex items-center gap-2">
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
						variant="outline"
						onClick={() =>
							setDraft({
								...draft,
								rosterCriteria: { ...criteria, inti: true, kadep: true },
							})
						}
					>
						INTI + KADEP
					</Button>
					<div>
						{departments.map((code) => (
							<label key={code} className="mr-4 inline-flex items-center gap-2">
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
							{invalidCount} assignment tidak valid dikecualikan; perlu review
							Identity.
						</p>
					)}
					<div className="max-h-80 overflow-auto">
						<table className="w-full text-left text-sm">
							<caption>
								Individu SR aktif; kandidat mengikuti assignment resmi
							</caption>
							<thead>
								<tr>
									<th>Peserta</th>
									<th>Pilih</th>
									<th>Include</th>
									<th>Exclude</th>
								</tr>
							</thead>
							<tbody>
								{candidates.map((sr) => (
									<tr key={sr.userId}>
										<td>
											{sr.nim} · {sr.name} ({sr.departmentCode}/
											{sr.positionCode})
										</td>
										{(["individuals", "include", "exclude"] as const).map(
											(key) => (
												<td key={key}>
													<input
														type="checkbox"
														aria-label={`${key} ${sr.name} ${sr.nim}`}
														checked={
															criteria[key]?.includes(sr.userId) ?? false
														}
														onChange={(e) =>
															toggle(key, sr.userId, e.target.checked)
														}
													/>
												</td>
											),
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</fieldset>
				{error && <p role="alert">{error}</p>}
				<Button type="submit" loading={create.isPending || edit.isPending}>
					Simpan draft
				</Button>
			</form>
		</main>
	);
}
function localDateTime(iso: string) {
	const date = new Date(iso);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}
