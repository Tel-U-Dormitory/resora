"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc, trpcClient } from "@/utils/trpc";
import {
	ActivateMembershipDialog,
	DtCredentialsDialog,
	type DtIssuedCredentials,
	type DtMemberItem,
	ExtendPeriodDialog,
	ReasonConfirmDialog,
	RegisterCandidateDialog,
	UpdateAssignmentDialog,
} from "./dt-dialogs";
import { DtMemberDetailDialog } from "./dt-member-detail-dialog";
import {
	DT_STATUS_LABELS,
	type DtEffectiveStatus,
	dtErrorMessage,
	dtStatusBadgeClass,
	dtStatusLabel,
	formatDtPeriodRange,
} from "./dt-ui";

type TabId = "members" | "recap";
type ActiveModal =
	| { kind: "register" }
	| { kind: "detail"; membershipId: string }
	| { kind: "activate"; member: DtMemberItem }
	| { kind: "reject"; member: DtMemberItem }
	| { kind: "assign"; member: DtMemberItem }
	| { kind: "extend"; member: DtMemberItem }
	| { kind: "end"; member: DtMemberItem }
	| { kind: "archive"; member: DtMemberItem }
	| { kind: "resetPassword"; member: DtMemberItem };

export function DtManagerWorkspace() {
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<TabId>("members");
	const [search, setSearch] = useState("");
	const [periodName, setPeriodName] = useState("");
	const [departmentCode, setDepartmentCode] = useState("");
	const [buildingId, setBuildingId] = useState("");
	const [status, setStatus] = useState<DtEffectiveStatus | "">("");
	const [page, setPage] = useState(0);
	const [modal, setModal] = useState<ActiveModal | null>(null);
	const [credentialsBanner, setCredentialsBanner] = useState<{
		title: string;
		subtitle: string;
		credentials: DtIssuedCredentials;
	} | null>(null);

	const refsQuery = useQuery({
		...trpc.dt.references.queryOptions(),
		meta: { errorHandledLocally: true },
	});

	const filterPayload = {
		search: search.trim(),
		periodName,
		departmentCode,
		buildingId: buildingId || undefined,
		status: status || undefined,
	};

	const listQuery = useQuery({
		...trpc.dt.list.queryOptions({
			...filterPayload,
			limit: 20,
			offset: page * 20,
		}),
		meta: { errorHandledLocally: true },
	});

	const recapQuery = useQuery({
		...trpc.dt.participationRecap.queryOptions(filterPayload),
		enabled: activeTab === "recap",
		meta: { errorHandledLocally: true },
	});

	const invalidateDt = () =>
		queryClient.invalidateQueries({ queryKey: trpc.dt.pathKey() });

	const registerMutation = useMutation({
		mutationFn: (
			input: Parameters<typeof trpcClient.dt.registerCandidate.mutate>[0],
		) => trpcClient.dt.registerCandidate.mutate(input),
		onSuccess: async () => {
			toast.success("Calon anggota DT berhasil didaftarkan.");
			await invalidateDt();
		},
	});

	const rejectMutation = useMutation({
		mutationFn: (input: Parameters<typeof trpcClient.dt.reject.mutate>[0]) =>
			trpcClient.dt.reject.mutate(input),
		onSuccess: async () => {
			toast.success("Pendaftaran calon DT ditolak.");
			await invalidateDt();
		},
	});

	const assignMutation = useMutation({
		mutationFn: (
			input: Parameters<typeof trpcClient.dt.updateAssignment.mutate>[0],
		) => trpcClient.dt.updateAssignment.mutate(input),
		onSuccess: async () => {
			toast.success("Penugasan anggota DT diperbarui.");
			await invalidateDt();
		},
	});

	const extendMutation = useMutation({
		mutationFn: (
			input: Parameters<typeof trpcClient.dt.extendPeriod.mutate>[0],
		) => trpcClient.dt.extendPeriod.mutate(input),
		onSuccess: async () => {
			toast.success("Periode keanggotaan DT diperpanjang.");
			await invalidateDt();
		},
	});

	const endMutation = useMutation({
		mutationFn: (
			input: Parameters<typeof trpcClient.dt.endMembership.mutate>[0],
		) => trpcClient.dt.endMembership.mutate(input),
		onSuccess: async () => {
			toast.success("Keanggotaan DT diakhiri dan sesi login dicabut.");
			await invalidateDt();
		},
	});

	const archiveMutation = useMutation({
		mutationFn: (input: Parameters<typeof trpcClient.dt.archive.mutate>[0]) =>
			trpcClient.dt.archive.mutate(input),
		onSuccess: async () => {
			toast.success("Riwayat keanggotaan DT diarsipkan.");
			await invalidateDt();
		},
	});

	const counts = listQuery.data?.counts;
	const references = refsQuery.data ?? { departments: [], buildings: [] };
	const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 20));

	return (
		<section className="resora-page space-y-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
						Manajemen Dorm Team (DT)
					</h1>
					<p className="text-muted-foreground text-xs sm:text-sm">
						Kelola calon, keanggotaan aktif, periode, penugasan, dan rekap
						partisipasi Dorm Team di bawah Departemen Adaptif.
					</p>
				</div>
				<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
					<Button
						variant="outline"
						leftIcon={<RefreshCw size={15} aria-hidden="true" />}
						loading={listQuery.isFetching}
						onClick={() => void invalidateDt()}
					>
						Perbarui
					</Button>
					<Button
						leftIcon={<Plus size={16} aria-hidden="true" />}
						onClick={() => setModal({ kind: "register" })}
					>
						Daftarkan calon DT
					</Button>
				</div>
			</header>

			{counts && (
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Card>
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs">Total tercatat</p>
							<p className="mt-1 font-bold text-2xl tabular-nums">
								{counts.total}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs">Aktif</p>
							<p className="mt-1 font-bold text-2xl text-success tabular-nums">
								{counts.active}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs">Menunggu review</p>
							<p className="mt-1 font-bold text-2xl text-warning tabular-nums">
								{counts.candidate}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<p className="text-muted-foreground text-xs">Berakhir / Arsip</p>
							<p className="mt-1 font-bold text-2xl text-text-secondary tabular-nums">
								{counts.expired + counts.ended + counts.archived}
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			<Tabs
				value={activeTab}
				onValueChange={(next) => setActiveTab(next as TabId)}
			>
				<TabsList aria-label="Navigasi manajemen Dorm Team">
					<TabsTrigger value="members">Daftar & Kelola DT</TabsTrigger>
					<TabsTrigger value="recap">Rekap Partisipasi</TabsTrigger>
				</TabsList>
			</Tabs>

			<Card>
				<CardContent className="p-4">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
						<div className="space-y-1.5">
							<Label htmlFor="dt-search">Cari nama / NIM / proker</Label>
							<Input
								id="dt-search"
								type="search"
								maxLength={100}
								placeholder="Cari anggota DT"
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(0);
								}}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="dt-filter-period">Periode</Label>
							<Select
								id="dt-filter-period"
								value={periodName}
								onChange={(e) => {
									setPeriodName(e.target.value);
									setPage(0);
								}}
							>
								<option value="">Semua periode</option>
								{(listQuery.data?.periodOptions ?? []).map((p) => (
									<option key={p} value={p}>
										{p}
									</option>
								))}
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="dt-filter-dept">Departemen</Label>
							<Select
								id="dt-filter-dept"
								value={departmentCode}
								onChange={(e) => {
									setDepartmentCode(e.target.value);
									setPage(0);
								}}
							>
								<option value="">Semua departemen</option>
								{references.departments.map((d) => (
									<option key={d.code} value={d.code}>
										{d.name}
									</option>
								))}
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="dt-filter-bldg">Gedung</Label>
							<Select
								id="dt-filter-bldg"
								value={buildingId}
								onChange={(e) => {
									setBuildingId(e.target.value);
									setPage(0);
								}}
							>
								<option value="">Semua gedung</option>
								{references.buildings.map((b) => (
									<option key={b.id} value={b.id}>
										{b.name}
									</option>
								))}
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="dt-filter-status">Status</Label>
							<Select
								id="dt-filter-status"
								value={status}
								onChange={(e) => {
									setStatus(e.target.value as DtEffectiveStatus | "");
									setPage(0);
								}}
							>
								<option value="">Semua status</option>
								{Object.entries(DT_STATUS_LABELS).map(([code, label]) => (
									<option key={code} value={code}>
										{String(label)}
									</option>
								))}
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>

			{activeTab === "members" && (
				<Card>
					<CardContent className="space-y-4 p-4">
						{listQuery.isPending ? (
							<p role="status" className="text-muted-foreground text-sm">
								Memuat daftar Dorm Team…
							</p>
						) : listQuery.isError ? (
							<div role="alert" className="space-y-3">
								<p className="text-danger text-sm">
									{dtErrorMessage(listQuery.error)}
								</p>
								<Button
									variant="outline"
									onClick={() => void listQuery.refetch()}
								>
									Coba kembali
								</Button>
							</div>
						) : !listQuery.data?.items.length ? (
							<EmptyState
								variant="folder"
								title="Belum ada anggota Dorm Team"
								description={
									search || periodName || departmentCode || buildingId || status
										? "Tidak ada anggota DT yang sesuai dengan filter pencarian."
										: "Daftarkan mahasiswa sebagai calon DT untuk memulai pengelolaan."
								}
								action={
									search ||
									periodName ||
									departmentCode ||
									buildingId ||
									status ? (
										<Button
											variant="outline"
											onClick={() => {
												setSearch("");
												setPeriodName("");
												setDepartmentCode("");
												setBuildingId("");
												setStatus("");
												setPage(0);
											}}
										>
											Reset filter
										</Button>
									) : (
										<Button onClick={() => setModal({ kind: "register" })}>
											+ Daftarkan calon DT
										</Button>
									)
								}
							/>
						) : (
							<>
								<div className="space-y-3 md:hidden">
									{listQuery.data.items.map((member) => (
										<article
											key={member.id}
											className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5"
										>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<p className="truncate font-bold text-sm">
														{member.name}
													</p>
													<p className="text-muted-foreground text-xs">
														NIM {member.nim} · {member.periodName}
													</p>
												</div>
												<span
													className={`shrink-0 rounded-full border px-2.5 py-0.5 font-semibold text-[11px] ${dtStatusBadgeClass(member.effectiveStatus)}`}
												>
													{dtStatusLabel(member.effectiveStatus)}
												</span>
											</div>
											<p className="text-muted-foreground text-xs">
												{member.departmentName ?? "Tanpa departemen"} ·{" "}
												{member.buildingName ?? "Tanpa gedung"}
												{member.workProgram ? ` · ${member.workProgram}` : ""}
											</p>
											<p className="text-muted-foreground text-xs">
												{formatDtPeriodRange(member.startsOn, member.endsOn)}
											</p>
											<div className="flex flex-wrap gap-2 pt-1">
												<Button
													size="sm"
													variant="outline"
													onClick={() =>
														setModal({
															kind: "detail",
															membershipId: member.id,
														})
													}
												>
													Detail
												</Button>
												{member.effectiveStatus === "CANDIDATE" && (
													<>
														<Button
															size="sm"
															onClick={() =>
																setModal({ kind: "activate", member })
															}
														>
															Aktifkan
														</Button>
														<Button
															size="sm"
															variant="danger"
															onClick={() =>
																setModal({ kind: "reject", member })
															}
														>
															Tolak
														</Button>
													</>
												)}
												{member.effectiveStatus === "ACTIVE" && (
													<>
														<Button
															size="sm"
															variant="outline"
															onClick={() =>
																setModal({ kind: "assign", member })
															}
														>
															Penugasan
														</Button>
														<Button
															size="sm"
															variant="outline"
															onClick={() =>
																setModal({ kind: "extend", member })
															}
														>
															Perpanjang
														</Button>
														<Button
															size="sm"
															variant="danger"
															onClick={() => setModal({ kind: "end", member })}
														>
															Akhiri
														</Button>
													</>
												)}
												{(member.effectiveStatus === "EXPIRED" ||
													member.effectiveStatus === "ENDED" ||
													member.effectiveStatus === "REJECTED") && (
													<Button
														size="sm"
														variant="outline"
														onClick={() =>
															setModal({ kind: "archive", member })
														}
													>
														Arsipkan
													</Button>
												)}
											</div>
										</article>
									))}
								</div>

								<div className="hidden overflow-x-auto md:block">
									<table className="w-full border-collapse text-left text-sm">
										<thead>
											<tr className="border-border border-b text-muted-foreground text-xs">
												<th className="px-3 py-2.5 font-semibold">Anggota</th>
												<th className="px-3 py-2.5 font-semibold">Periode</th>
												<th className="px-3 py-2.5 font-semibold">Penugasan</th>
												<th className="px-3 py-2.5 font-semibold">Status</th>
												<th className="px-3 py-2.5 text-right font-semibold">
													Aksi
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{listQuery.data.items.map((member) => (
												<tr key={member.id} className="align-top">
													<td className="px-3 py-3">
														<p className="font-semibold text-foreground">
															{member.name}
														</p>
														<p className="text-muted-foreground text-xs">
															{member.nim} · {member.email}
														</p>
													</td>
													<td className="px-3 py-3">
														<p className="font-medium">{member.periodName}</p>
														<p className="text-muted-foreground text-xs">
															{formatDtPeriodRange(
																member.startsOn,
																member.endsOn,
															)}
														</p>
													</td>
													<td className="px-3 py-3">
														<p className="font-medium">
															{member.departmentName ?? "—"} ·{" "}
															{member.buildingName ?? "—"}
														</p>
														{member.workProgram && (
															<p className="text-muted-foreground text-xs">
																{member.workProgram}
															</p>
														)}
													</td>
													<td className="px-3 py-3">
														<span
															className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold text-xs ${dtStatusBadgeClass(member.effectiveStatus)}`}
														>
															{dtStatusLabel(member.effectiveStatus)}
														</span>
													</td>
													<td className="px-3 py-3">
														<div className="flex flex-wrap justify-end gap-1.5">
															<Button
																size="sm"
																variant="outline"
																onClick={() =>
																	setModal({
																		kind: "detail",
																		membershipId: member.id,
																	})
																}
															>
																Detail
															</Button>
															{member.effectiveStatus === "CANDIDATE" && (
																<>
																	<Button
																		size="sm"
																		onClick={() =>
																			setModal({ kind: "activate", member })
																		}
																	>
																		Aktifkan
																	</Button>
																	<Button
																		size="sm"
																		variant="danger"
																		onClick={() =>
																			setModal({ kind: "reject", member })
																		}
																	>
																		Tolak
																	</Button>
																</>
															)}
															{member.effectiveStatus === "ACTIVE" && (
																<>
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() =>
																			setModal({ kind: "assign", member })
																		}
																	>
																		Penugasan
																	</Button>
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() =>
																			setModal({ kind: "extend", member })
																		}
																	>
																		Perpanjang
																	</Button>
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() =>
																			setModal({
																				kind: "resetPassword",
																				member,
																			})
																		}
																	>
																		Reset PW
																	</Button>
																	<Button
																		size="sm"
																		variant="danger"
																		onClick={() =>
																			setModal({ kind: "end", member })
																		}
																	>
																		Akhiri
																	</Button>
																</>
															)}
															{member.effectiveStatus === "EXPIRED" && (
																<>
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() =>
																			setModal({ kind: "extend", member })
																		}
																	>
																		Perpanjang
																	</Button>
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() =>
																			setModal({ kind: "archive", member })
																		}
																	>
																		Arsipkan
																	</Button>
																</>
															)}
															{(member.effectiveStatus === "ENDED" ||
																member.effectiveStatus === "REJECTED") && (
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() =>
																		setModal({ kind: "archive", member })
																	}
																>
																	Arsipkan
																</Button>
															)}
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>

								<nav
									aria-label="Halaman daftar DT"
									className="flex flex-wrap items-center justify-between gap-3 pt-2"
								>
									<Button
										variant="outline"
										disabled={page === 0 || listQuery.isFetching}
										onClick={() => setPage(page - 1)}
									>
										Sebelumnya
									</Button>
									<span className="text-muted-foreground text-sm">
										{listQuery.data.total} anggota · Halaman {page + 1} dari{" "}
										{totalPages}
									</span>
									<Button
										variant="outline"
										disabled={
											(page + 1) * 20 >= listQuery.data.total ||
											listQuery.isFetching
										}
										onClick={() => setPage(page + 1)}
									>
										Berikutnya
									</Button>
								</nav>
							</>
						)}
					</CardContent>
				</Card>
			)}

			{activeTab === "recap" && (
				<Card>
					<CardContent className="space-y-4 p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h2 className="font-semibold text-base">
									Rekap Kehadiran & Partisipasi DT
								</h2>
								<p className="text-muted-foreground text-xs">
									Menampilkan akumulasi undangan event, kehadiran QR/manual, dan
									keterlibatan kepanitiaan. Skor poin partisipasi belum
									ditetapkan.
								</p>
							</div>
							{recapQuery.data && (
								<div className="flex flex-wrap gap-2 text-xs">
									<span className="rounded-lg border border-border bg-surface-subtle px-2.5 py-1 font-medium">
										Anggota: {recapQuery.data.totals.members}
									</span>
									<span className="rounded-lg border border-border bg-surface-subtle px-2.5 py-1 font-medium">
										Total Hadir: {recapQuery.data.totals.present} /{" "}
										{recapQuery.data.totals.invited}
									</span>
									<span className="rounded-lg border border-border bg-surface-subtle px-2.5 py-1 font-medium">
										Penugasan Panitia:{" "}
										{recapQuery.data.totals.committeeAssignments}
									</span>
								</div>
							)}
						</div>

						{recapQuery.isPending ? (
							<p role="status" className="text-muted-foreground text-sm">
								Memuat rekap partisipasi DT…
							</p>
						) : recapQuery.isError ? (
							<p role="alert" className="text-danger text-sm">
								{dtErrorMessage(recapQuery.error)}
							</p>
						) : !recapQuery.data?.items.length ? (
							<EmptyState
								variant="folder"
								title="Belum ada data rekap partisipasi"
								description="Tidak ada anggota DT yang sesuai filter untuk direkap."
							/>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full border-collapse text-left text-sm">
									<thead>
										<tr className="border-border border-b text-muted-foreground text-xs">
											<th className="px-3 py-2 font-semibold">Anggota DT</th>
											<th className="px-3 py-2 font-semibold">Status</th>
											<th className="px-3 py-2 text-right font-semibold">
												Diundang
											</th>
											<th className="px-3 py-2 text-right font-semibold">
												Hadir
											</th>
											<th className="px-3 py-2 text-right font-semibold">
												Pending
											</th>
											<th className="px-3 py-2 text-right font-semibold">
												Tidak Hadir
											</th>
											<th className="px-3 py-2 text-right font-semibold">
												Panitia
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border tabular-nums">
										{recapQuery.data.items.map((row) => (
											<tr key={row.membershipId}>
												<td className="px-3 py-2.5">
													<p className="font-semibold">{row.name}</p>
													<p className="text-muted-foreground text-xs">
														{row.nim} · {row.periodName}
													</p>
												</td>
												<td className="px-3 py-2.5">
													<span
														className={`inline-flex rounded-full border px-2 py-0.5 font-semibold text-xs ${dtStatusBadgeClass(row.effectiveStatus)}`}
													>
														{dtStatusLabel(row.effectiveStatus)}
													</span>
												</td>
												<td className="px-3 py-2.5 text-right">
													{row.attendance.invited}
												</td>
												<td className="px-3 py-2.5 text-right font-semibold text-success">
													{row.attendance.present}
												</td>
												<td className="px-3 py-2.5 text-right text-warning">
													{row.attendance.pending}
												</td>
												<td className="px-3 py-2.5 text-right text-danger">
													{row.attendance.absent}
												</td>
												<td className="px-3 py-2.5 text-right">
													{row.committeeCount}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{modal?.kind === "register" && (
				<RegisterCandidateDialog
					references={references}
					onClose={() => setModal(null)}
					onSubmit={(values) => registerMutation.mutateAsync(values)}
				/>
			)}
			{modal?.kind === "detail" && (
				<DtMemberDetailDialog
					membershipId={modal.membershipId}
					onClose={() => setModal(null)}
				/>
			)}
			{modal?.kind === "activate" && (
				<ActivateMembershipDialog
					member={modal.member}
					references={references}
					onClose={() => setModal(null)}
					onActivate={async (values) => {
						const issued = await trpcClient.dt.activate.mutate(values);
						setModal(null);
						setCredentialsBanner({
							title: "Anggota DT berhasil diaktifkan",
							subtitle:
								"Bagikan password sementara ini secara privat kepada anggota DT untuk login pertama.",
							credentials: issued,
						});
						await invalidateDt();
						return issued;
					}}
				/>
			)}
			{modal?.kind === "reject" && (
				<ReasonConfirmDialog
					title="Tolak calon anggota DT"
					description={`Tolak pendaftaran ${modal.member.name} (${modal.member.nim})? Akun tidak akan diaktifkan untuk login.`}
					submitLabel="Tolak calon"
					variant="danger"
					onClose={() => setModal(null)}
					onSubmit={(reason) =>
						rejectMutation.mutateAsync({
							membershipId: modal.member.id,
							reason,
						})
					}
				/>
			)}
			{modal?.kind === "assign" && (
				<UpdateAssignmentDialog
					member={modal.member}
					references={references}
					onClose={() => setModal(null)}
					onSubmit={(values) => assignMutation.mutateAsync(values)}
				/>
			)}
			{modal?.kind === "extend" && (
				<ExtendPeriodDialog
					member={modal.member}
					onClose={() => setModal(null)}
					onSubmit={(values) => extendMutation.mutateAsync(values)}
				/>
			)}
			{modal?.kind === "end" && (
				<ReasonConfirmDialog
					title="Akhiri keanggotaan DT"
					description={`Akhiri keanggotaan ${modal.member.name} (${modal.member.nim}) sekarang? Akses login dan sesi aktif DT akan segera dicabut tanpa menghapus riwayat.`}
					submitLabel="Akhiri keanggotaan"
					variant="danger"
					onClose={() => setModal(null)}
					onSubmit={(reason) =>
						endMutation.mutateAsync({
							membershipId: modal.member.id,
							reason,
						})
					}
				/>
			)}
			{modal?.kind === "archive" && (
				<ReasonConfirmDialog
					title="Arsipkan riwayat DT"
					description={`Arsipkan keanggotaan ${modal.member.name} (${modal.member.nim})? Seluruh riwayat periode, penugasan, dan absensi tetap dipertahankan.`}
					submitLabel="Arsipkan riwayat"
					defaultReason="Pengarsipan riwayat keanggotaan DT"
					requireReason={false}
					onClose={() => setModal(null)}
					onSubmit={(reason) =>
						archiveMutation.mutateAsync({
							membershipId: modal.member.id,
							reason: reason || "Pengarsipan riwayat keanggotaan DT",
						})
					}
				/>
			)}
			{modal?.kind === "resetPassword" && (
				<ReasonConfirmDialog
					title="Reset password akun DT"
					description={`Reset password untuk ${modal.member.name} (${modal.member.nim})? Sesi aktif DT akan dicabut dan pemilik akun wajib mengganti password saat login.`}
					submitLabel="Reset password"
					defaultReason="Reset password oleh Departemen Adaptif"
					requireReason={false}
					onClose={() => setModal(null)}
					onSubmit={async () => {
						const issued = await trpcClient.dt.resetPassword.mutate({
							membershipId: modal.member.id,
						});
						setCredentialsBanner({
							title: "Password akun DT direset",
							subtitle:
								"Bagikan password sementara baru ini secara privat. Pemilik akun wajib mengganti password setelah masuk.",
							credentials: issued,
						});
						await invalidateDt();
					}}
				/>
			)}
			{credentialsBanner && (
				<DtCredentialsDialog
					title={credentialsBanner.title}
					subtitle={credentialsBanner.subtitle}
					credentials={credentialsBanner.credentials}
					onClose={() => setCredentialsBanner(null)}
				/>
			)}
		</section>
	);
}
