"use client";

import type { AppRouter } from "@resora/api/routers/index";
import { Checkbox } from "@resora/ui/components/checkbox";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc, trpcClient } from "@/utils/trpc";
import { CommitteeDialog, CommitteeFields } from "./committee-dialog";
import { committeeError, committeePositionLabels } from "./committee-ui";

type Detail = inferRouterOutputs<AppRouter>["committee"]["detail"];
type Member = Detail["members"][number];
type Division = Detail["divisions"][number];
type Editor =
	| { kind: "committee" | "deleteCommittee" | "addDivision" | "addMember" }
	| { kind: "division" | "deleteDivision"; division: Division }
	| { kind: "member" | "removeMember"; member: Member };

function MemberFields({
	committee,
	member,
}: {
	committee: Detail;
	member?: Member;
}) {
	return (
		<>
			{member && (
				<p className="break-words font-semibold">
					{member.name} · {member.nim}
				</p>
			)}
			{member && <input type="hidden" name="userId" value={member.userId} />}
			<div className="space-y-2">
				<Label htmlFor="member-division">Divisi</Label>
				<Select
					id="member-division"
					name="divisionId"
					required
					defaultValue={member?.divisionId ?? ""}
				>
					<option value="">Pilih divisi</option>
					{committee.divisions.map((row) => (
						<option key={row.id} value={row.id}>
							{row.name}
						</option>
					))}
				</Select>
			</div>
			<div className="space-y-2">
				<Label htmlFor="member-position">Jabatan kepanitiaan</Label>
				<Select
					id="member-position"
					name="positionCode"
					required
					defaultValue={member?.positionCode ?? "ANGGOTA"}
				>
					{committee.positions.map((code) => (
						<option key={code} value={code}>
							{committeePositionLabels[code]}
						</option>
					))}
				</Select>
				<p className="text-muted-foreground text-xs">
					Jabatan panitia tidak memberikan hak akses sistem.
				</p>
			</div>
		</>
	);
}

function BulkMemberDialog({
	committee,
	onClose,
}: {
	committee: Detail;
	onClose: () => void;
}) {
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<
		Pick<Member, "userId" | "name" | "nim">[]
	>([]);
	const candidates = useQuery({
		...trpc.committee.candidates.queryOptions({
			committeeId: committee.id,
			search: search.trim(),
		}),
		enabled: search.trim().length >= 2,
		meta: { errorHandledLocally: true },
	});
	const toggle = (
		candidate: Pick<Member, "userId" | "name" | "nim">,
		checked: boolean,
	) => {
		setSelected((current) => {
			if (!checked)
				return current.filter((row) => row.userId !== candidate.userId);
			if (
				current.length >= 30 ||
				current.some((row) => row.userId === candidate.userId)
			)
				return current;
			return [...current, candidate];
		});
	};
	return (
		<CommitteeDialog
			title="Tambah anggota"
			description={`Kepanitiaan: ${committee.name}. Satu divisi dan jabatan berlaku untuk seluruh pilihan.`}
			onClose={onClose}
			submitLabel={`Tambahkan ${selected.length} anggota`}
			onSubmit={(fields) => {
				const userIds = selected.map((row) => row.userId);
				if (
					!userIds.length ||
					userIds.length > 30 ||
					new Set(userIds).size !== userIds.length
				)
					throw Error("COMMITTEE_BULK_SELECTION_INVALID");
				const divisionId = String(fields.get("divisionId") ?? "");
				const positionCode = committee.positions.find(
					(code) => code === fields.get("positionCode"),
				);
				if (
					!committee.divisions.some((row) => row.id === divisionId) ||
					!positionCode
				)
					throw Error("COMMITTEE_BULK_ASSIGNMENT_INVALID");
				return trpcClient.committee.addMembers.mutate({
					committeeId: committee.id,
					divisionId,
					positionCode,
					userIds,
				});
			}}
		>
			{(busy) => (
				<>
					<div className="space-y-2">
						<Label htmlFor="candidate-search">Cari SR aktif (nama / NIM)</Label>
						<Input
							id="candidate-search"
							type="search"
							value={search}
							maxLength={100}
							onChange={(event) => setSearch(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.preventDefault();
							}}
						/>
						<p className="text-muted-foreground text-xs">
							Ketik minimal 2 karakter. Maksimal 20 hasil per pencarian, bukan
							seluruh kandidat. Perjelas kata kunci untuk mencari SR lainnya.
						</p>
					</div>
					{search.trim().length >= 2 &&
						(candidates.isPending ? (
							<p role="status">Mencari SR…</p>
						) : candidates.isError ? (
							<div role="alert" className="space-y-2">
								<p>{committeeError(candidates.error)}</p>
								<Button
									type="button"
									variant="outline"
									onClick={() => void candidates.refetch()}
								>
									Coba kembali
								</Button>
							</div>
						) : !candidates.data?.length ? (
							<p role="status">
								Tidak ada SR eligible yang sesuai atau semua hasil sudah menjadi
								anggota.
							</p>
						) : (
							<fieldset className="space-y-2">
								<legend className="font-semibold text-sm">
									Hasil pencarian
								</legend>
								<ul className="max-h-60 space-y-2 overflow-y-auto">
									{candidates.data.map((row) => {
										const checked = selected.some(
											(item) => item.userId === row.userId,
										);
										return (
											<li
												key={row.userId}
												className="flex items-start gap-3 rounded-lg border border-border p-3"
											>
												<Checkbox
													id={`candidate-${row.userId}`}
													checked={checked}
													disabled={busy || (!checked && selected.length >= 30)}
													onCheckedChange={(value) => {
														if (!busy) toggle(row, value);
													}}
												/>
												<Label
													htmlFor={`candidate-${row.userId}`}
													className="min-w-0 break-words"
												>
													{row.name} · {row.nim}
												</Label>
											</li>
										);
									})}
								</ul>
							</fieldset>
						))}
					<div className="space-y-2">
						<p
							role="status"
							className="font-semibold text-sm"
						>{`${selected.length} / 30 SR dipilih`}</p>
						{selected.length > 0 && (
							<ul
								aria-label="SR terpilih"
								className="max-h-60 space-y-2 overflow-y-auto"
							>
								{selected.map((row) => (
									<li
										key={row.userId}
										className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
									>
										<span className="min-w-0 break-words text-sm">
											{row.name} · {row.nim}
										</span>
										<Button
											type="button"
											variant="outline"
											size="sm"
											aria-label={`Batalkan pilihan ${row.name} (${row.nim})`}
											onClick={() => toggle(row, false)}
										>
											Batalkan
										</Button>
									</li>
								))}
							</ul>
						)}
						{selected.length === 30 && (
							<p className="text-muted-foreground text-xs">
								Batas 30 anggota tercapai. Batalkan pilihan sebelum memilih SR
								lain.
							</p>
						)}
					</div>
					<MemberFields committee={committee} />
				</>
			)}
		</CommitteeDialog>
	);
}

export default function CommitteeDetail({
	committeeId,
}: {
	committeeId: string;
}) {
	const router = useRouter();
	const [editor, setEditor] = useState<Editor | null>(null);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const query = useQuery({
		...trpc.committee.detail.queryOptions({ committeeId }),
		meta: { errorHandledLocally: true },
	});
	const data = query.data;
	if (query.isPending) return <p role="status">Memuat kepanitiaan…</p>;
	if (query.isError || !data)
		return (
			<div role="alert" className="space-y-4">
				<p>{committeeError(query.error)}</p>
				<Button variant="outline" onClick={() => void query.refetch()}>
					Coba kembali
				</Button>
				<Link
					href="/committees"
					className="focus-ring rounded text-primary hover:underline"
				>
					Kembali ke kepanitiaan
				</Link>
			</div>
		);
	const members = data.members.filter((row) =>
		`${row.name} ${row.nim}`
			.toLocaleLowerCase("id")
			.includes(search.trim().toLocaleLowerCase("id")),
	);
	const currentPage = Math.min(
		page,
		Math.max(0, Math.ceil(members.length / 15) - 1),
	);
	const divisionName = (id: string) =>
		data.divisions.find((row) => row.id === id)?.name ??
		"Divisi tidak tersedia";
	return (
		<section className="resora-page space-y-6">
			<nav
				aria-label="Breadcrumb"
				className="flex flex-wrap gap-2 text-muted-foreground text-sm"
			>
				<Link
					href="/committees"
					className="focus-ring rounded hover:text-foreground hover:underline"
				>
					Kepanitiaan
				</Link>
				<span aria-hidden="true">/</span>
				<span aria-current="page" className="min-w-0 break-words">
					{data.name}
				</span>
			</nav>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 space-y-2">
					<h1 className="break-words font-bold text-2xl tracking-tight">
						{data.name}
					</h1>
					<p className="whitespace-pre-wrap break-words text-muted-foreground text-sm">
						{data.description || "Belum ada deskripsi."}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() => setEditor({ kind: "committee" })}
					>
						Edit kepanitiaan
					</Button>
					<Button
						variant="outline"
						disabled={!!data.divisions.length || !!data.members.length}
						onClick={() => setEditor({ kind: "deleteCommittee" })}
					>
						Hapus kepanitiaan
					</Button>
				</div>
			</div>
			{!!data.divisions.length && (
				<p className="text-muted-foreground text-sm">
					Kepanitiaan hanya dapat dihapus setelah seluruh anggota dan divisinya
					dikeluarkan.
				</p>
			)}
			<Card>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-semibold text-lg">
							Divisi ({data.divisions.length})
						</h2>
						<Button
							variant="outline"
							onClick={() => setEditor({ kind: "addDivision" })}
						>
							Tambah divisi
						</Button>
					</div>
					{data.divisions.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Belum ada divisi. Tambahkan divisi sebelum memilih anggota.
						</p>
					) : (
						<ul className="grid gap-3 sm:grid-cols-2">
							{data.divisions.map((division) => {
								const count = data.members.filter(
									(row) => row.divisionId === division.id,
								).length;
								return (
									<li
										key={division.id}
										className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
									>
										<div className="min-w-0">
											<p className="break-words font-semibold">
												{division.name}
											</p>
											<p className="text-muted-foreground text-sm">
												{count} anggota{count > 0 && " · Tidak dapat dihapus"}
											</p>
										</div>
										<div className="flex gap-2">
											<Button
												variant="outline"
												onClick={() =>
													setEditor({ kind: "division", division })
												}
											>
												Ubah nama
											</Button>
											<Button
												variant="outline"
												disabled={count > 0}
												onClick={() =>
													setEditor({ kind: "deleteDivision", division })
												}
											>
												Hapus
											</Button>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-semibold text-lg">
							Anggota ({data.members.length})
						</h2>
						<Button
							disabled={!data.divisions.length}
							onClick={() => setEditor({ kind: "addMember" })}
						>
							Tambah anggota
						</Button>
					</div>
					<div className="max-w-lg space-y-2">
						<Label htmlFor="member-search">Cari anggota (nama / NIM)</Label>
						<Input
							id="member-search"
							type="search"
							maxLength={100}
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(0);
							}}
						/>
					</div>
					{!members.length ? (
						<p className="text-muted-foreground text-sm">
							Belum ada anggota yang sesuai.
						</p>
					) : (
						<ul className="space-y-3">
							{members
								.slice(currentPage * 15, (currentPage + 1) * 15)
								.map((member) => (
									<li
										key={member.userId}
										className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
									>
										<div className="min-w-0 space-y-1">
											<h3 className="break-words font-semibold">
												{member.name}
											</h3>
											<p className="text-muted-foreground text-sm">
												NIM {member.nim} · {divisionName(member.divisionId)} ·{" "}
												{committeePositionLabels[member.positionCode]}
											</p>
											{!member.eligible && (
												<p className="text-sm">
													Tidak eligible untuk penugasan baru. Keanggotaan tetap
													dapat dikeluarkan.
												</p>
											)}
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												variant="outline"
												disabled={!member.eligible}
												onClick={() => setEditor({ kind: "member", member })}
											>
												Edit penugasan
											</Button>
											<Button
												variant="outline"
												onClick={() =>
													setEditor({ kind: "removeMember", member })
												}
											>
												Keluarkan
											</Button>
										</div>
									</li>
								))}
						</ul>
					)}
					<nav
						aria-label="Halaman anggota"
						className="flex flex-wrap items-center justify-between gap-3"
					>
						<Button
							variant="outline"
							disabled={currentPage === 0}
							onClick={() => setPage(currentPage - 1)}
						>
							Sebelumnya
						</Button>
						<span className="text-sm">
							{members.length} hasil · Halaman {currentPage + 1} dari{" "}
							{Math.max(1, Math.ceil(members.length / 15))}
						</span>
						<Button
							variant="outline"
							disabled={(currentPage + 1) * 15 >= members.length}
							onClick={() => setPage(currentPage + 1)}
						>
							Berikutnya
						</Button>
					</nav>
				</CardContent>
			</Card>
			{editor && (
				<CommitteeEditor
					editor={editor}
					data={data}
					onClose={() => setEditor(null)}
					onDeleted={() => router.replace("/committees")}
				/>
			)}
		</section>
	);
}

function CommitteeEditor({
	editor,
	data,
	onClose,
	onDeleted,
}: {
	editor: Editor;
	data: Detail;
	onClose: () => void;
	onDeleted: () => void;
}) {
	const committeeId = data.id;
	const context = `Kepanitiaan: ${data.name}.`;
	if (editor.kind === "committee")
		return (
			<CommitteeDialog
				title="Edit kepanitiaan"
				description={context}
				onClose={onClose}
				onSubmit={(fields) =>
					trpcClient.committee.update.mutate({
						committeeId,
						name: String(fields.get("name") ?? "").trim(),
						description: String(fields.get("description") ?? "").trim(),
					})
				}
			>
				<CommitteeFields name={data.name} description={data.description} />
			</CommitteeDialog>
		);
	if (editor.kind === "deleteCommittee")
		return (
			<CommitteeDialog
				title="Hapus kepanitiaan?"
				description={`${context} Penghapusan permanen hanya diizinkan untuk kepanitiaan kosong.`}
				submitLabel="Ya, hapus kepanitiaan"
				onClose={onClose}
				onSuccess={onDeleted}
				onSubmit={() => trpcClient.committee.delete.mutate({ committeeId })}
			/>
		);
	if (editor.kind === "deleteDivision")
		return (
			<CommitteeDialog
				title="Hapus divisi?"
				description={`${context} Divisi ${editor.division.name} akan dihapus jika tidak memiliki anggota.`}
				submitLabel="Ya, hapus divisi"
				onClose={onClose}
				onSubmit={() =>
					trpcClient.committee.deleteDivision.mutate({
						committeeId,
						divisionId: editor.division.id,
					})
				}
			/>
		);
	if (editor.kind === "removeMember")
		return (
			<CommitteeDialog
				title="Keluarkan anggota?"
				description={`${context} Keluarkan ${editor.member.name} (${editor.member.nim}) dari divisi ${data.divisions.find((row) => row.id === editor.member.divisionId)?.name}? Profil struktural SR tetap utuh.`}
				submitLabel="Ya, keluarkan anggota"
				onClose={onClose}
				onSubmit={() =>
					trpcClient.committee.removeMember.mutate({
						committeeId,
						userId: editor.member.userId,
					})
				}
			/>
		);
	if (editor.kind === "division" || editor.kind === "addDivision")
		return (
			<CommitteeDialog
				title={
					editor.kind === "division" ? "Ubah nama divisi" : "Tambah divisi"
				}
				description={context}
				onClose={onClose}
				onSubmit={(fields) => {
					const name = String(fields.get("name") ?? "").trim();
					return editor.kind === "division"
						? trpcClient.committee.updateDivision.mutate({
								committeeId,
								divisionId: editor.division.id,
								name,
							})
						: trpcClient.committee.createDivision.mutate({ committeeId, name });
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="division-name">Nama divisi</Label>
					<Input
						id="division-name"
						name="name"
						defaultValue={
							editor.kind === "division" ? editor.division.name : ""
						}
						required
						maxLength={150}
						pattern=".*\S.*"
					/>
				</div>
			</CommitteeDialog>
		);
	if (editor.kind === "addMember")
		return (
			<BulkMemberDialog key={committeeId} committee={data} onClose={onClose} />
		);
	if (editor.kind !== "member") return null;
	return (
		<CommitteeDialog
			title="Edit penugasan anggota"
			description={context}
			onClose={onClose}
			onSubmit={(fields) => {
				const input = {
					committeeId,
					userId: String(fields.get("userId") ?? ""),
					divisionId: String(fields.get("divisionId") ?? ""),
					positionCode: String(
						fields.get("positionCode"),
					) as Detail["positions"][number],
				};
				return trpcClient.committee.updateMember.mutate(input);
			}}
		>
			<MemberFields committee={data} member={editor.member} />
		</CommitteeDialog>
	);
}
