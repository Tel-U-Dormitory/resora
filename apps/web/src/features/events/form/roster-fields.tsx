"use client";

import { Input } from "@resora/ui/components/input";
import { Select } from "@resora/ui/components/select";

import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";

import { committeePositionLabels } from "../../committee/public";

import {
	isInvited,
	resetEventOrganization,
	setParticipantInvitation,
} from "../roster-selection";
import { type DraftEditorView, departments, fieldClass } from "./form-model";
export function RosterFields({ view }: { view: DraftEditorView }) {
	const {
		advancedMode,
		invalidCount,
		initialCommitteeName,
		draft,
		setDraft,
		committeeSearch,
		setCommitteeSearch,
		committeePage,
		setCommitteePage,
		committeeMode,
		frozenCommittee,
		committees,
		committee,
		search,
		setSearch,
		setPage,
		criteria,
		assignments,
		defaultIds,
		available,
		candidatePage,
		invitedCount,
	} = view;
	return (
		<section
			aria-labelledby="roster-heading"
			className="space-y-5 rounded-[1rem] border border-border bg-surface p-5 shadow-xs"
		>
			<h2
				id="roster-heading"
				className="flex items-center gap-2 font-semibold text-base"
			>
				<Users className="size-4 text-muted-foreground" aria-hidden="true" />{" "}
				Peserta
			</h2>
			<div className="space-y-2">
				<label htmlFor="organization-context" className="font-medium text-sm">
					Kepengurusan Event
				</label>
				<Select
					id="organization-context"
					value={draft.organizationContext ?? "SR"}
					disabled={Boolean(advancedMode)}
					onChange={(event) => {
						setDraft(
							resetEventOrganization(
								draft,
								event.target.value as "SR" | "COMMITTEE",
							),
						);
						setPage(1);
					}}
				>
					<option value="SR">Struktural SR</option>
					<option value="COMMITTEE">Kepanitiaan Kegiatan</option>
				</Select>
			</div>
			{committeeMode && (
				<div className="space-y-3">
					{frozenCommittee ? (
						<p className="text-sm">
							Kepanitiaan: <strong>{initialCommitteeName}</strong>. Konteks dan
							kepanitiaan tidak dapat diubah setelah publikasi.
						</p>
					) : (
						<>
							<label
								className="block space-y-2 text-sm"
								htmlFor="committee-search"
							>
								Cari kepanitiaan
								<Input
									id="committee-search"
									type="search"
									maxLength={150}
									value={committeeSearch}
									onChange={(event) => {
										setCommitteeSearch(event.target.value);
										setCommitteePage(0);
									}}
								/>
							</label>
							{committees.isPending ? (
								<p role="status">Memuat kepanitiaan…</p>
							) : committees.isError ? (
								<div role="alert">
									<p>Daftar kepanitiaan gagal dimuat.</p>
									<Button
										type="button"
										variant="outline"
										onClick={() => void committees.refetch()}
									>
										Coba kembali
									</Button>
								</div>
							) : (
								!committees.data?.committees.length && (
									<p>Belum ada kepanitiaan yang sesuai.</p>
								)
							)}
							<label
								htmlFor="event-committee"
								className="block space-y-2 text-sm"
							>
								Pilih Kepanitiaan
								<Select
									id="event-committee"
									required
									value={draft.committeeId ?? ""}
									onChange={(event) => {
										setDraft(
											resetEventOrganization(
												draft,
												"COMMITTEE",
												event.target.value || null,
											),
										);
										setPage(1);
									}}
								>
									<option value="">Pilih kepanitiaan</option>
									{draft.committeeId &&
										!committees.data?.committees.some(
											(row) => row.id === draft.committeeId,
										) && (
											<option value={draft.committeeId}>
												{committee.data?.name ||
													initialCommitteeName ||
													"Kepanitiaan terpilih"}
											</option>
										)}
									{committees.data?.committees.map((row) => (
										<option key={row.id} value={row.id}>
											{row.name}
										</option>
									))}
								</Select>
							</label>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									disabled={committeePage === 0 || committees.isFetching}
									onClick={() => setCommitteePage(committeePage - 1)}
								>
									Sebelumnya
								</Button>
								<span className="self-center text-sm">
									Halaman {committeePage + 1}
								</span>
								<Button
									type="button"
									variant="outline"
									disabled={
										committees.isFetching ||
										(committeePage + 1) * 20 >= (committees.data?.total ?? 0)
									}
									onClick={() => setCommitteePage(committeePage + 1)}
								>
									Berikutnya
								</Button>
							</div>
							{draft.committeeId &&
								(committee.isPending ? (
									<p role="status">Memuat anggota kepanitiaan…</p>
								) : committee.isError ? (
									<div role="alert">
										<p>Anggota kepanitiaan gagal dimuat.</p>
										<Button
											type="button"
											variant="outline"
											onClick={() => void committee.refetch()}
										>
											Coba kembali
										</Button>
									</div>
								) : (
									<p className="text-sm">
										{assignments.size} anggota memenuhi syarat. Daftar final
										divalidasi kembali saat publikasi.
									</p>
								))}
						</>
					)}
					<p className="text-muted-foreground text-sm">
						{frozenCommittee
							? "Checkbox memakai snapshot undangan yang dibekukan. Perubahan keanggotaan panitia terbaru tidak disinkronkan; centang/hapus centang untuk perubahan individu eksplisit."
							: "Anggota panitia yang memenuhi syarat otomatis diundang. Tambahkan undangan individu atau hapus centang untuk mengecualikan."}
					</p>
				</div>
			)}
			{advancedMode && !committeeMode && (
				<p className="text-muted-foreground text-sm">
					Daftar ini menampilkan SR aktif terkini. Snapshot undangan yang sudah
					ada tetap dipertahankan jika kriteria peserta tidak diubah.
				</p>
			)}
			<p className="text-muted-foreground text-sm">
				Pilih kelompok, lalu tinjau peserta. Hapus centang untuk mengecualikan
				seseorang dari undangan.
			</p>
			{!committeeMode && (
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
								className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
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
				</fieldset>
			)}
			<div className="border-border border-t pt-5">
				<h3 className="font-semibold text-sm">Tinjau peserta</h3>
				<p className="mt-1 text-muted-foreground text-xs">
					Pilihan individu menyesuaikan kelompok yang Anda pilih.
				</p>
			</div>
			{invalidCount > 0 && (
				<p role="alert">
					{invalidCount} akun tidak tersedia karena penempatan organisasi tidak
					valid. Hubungi pengelola akun.
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
				{advancedMode && !committeeMode
					? "calon peserta berdasarkan kriteria"
					: "peserta diundang"}{" "}
				dari {available.length} kandidat · {candidatePage.matching} hasil
				pencarian
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
									{committeeMode && (
										<span className="mt-1 block text-muted-foreground text-xs">
											{sr.committeeDivision
												? `${sr.committeeDivision} / ${committeePositionLabels[sr.committeePosition ?? ""] ?? sr.committeePosition}`
												: "Non-Panitia / Undangan"}
										</span>
									)}
								</td>
								<td className="p-3">
									<label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-ring">
										<input
											type="checkbox"
											className="focus-ring size-4 accent-primary"
											aria-label={`Diundang: ${sr.name} ${sr.nim}`}
											checked={isInvited(sr, criteria, defaultIds)}
											onChange={(e) =>
												setDraft({
													...draft,
													rosterCriteria: setParticipantInvitation(
														criteria,
														sr,
														e.target.checked,
														defaultIds,
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
	);
}
