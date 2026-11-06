"use client";
import { Input } from "@resora/ui/components/input";

import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { committeePositionLabels } from "../../committee/public";

import type { EventDetailView } from "./detail-model";
export function InvitationsPanel({ view }: { view: EventDetailView }) {
	const {
		eventId,
		setInvitationToggle,
		invitationSearch,
		setInvitationSearch,
		setInvitationPage,
		preview,
		event,
		invited,
		invitationsOpen,
		visibleInvitations,
	} = view;
	return (
		<Card>
			<CardHeader
				title={event.status === "DRAFT" ? "Preview peserta" : "Daftar undangan"}
				description={
					event.status === "DRAFT"
						? "Peserta aktif terkini. Daftar final disimpan saat publikasi."
						: "Daftar ini menyimpan informasi peserta saat event dipublikasikan."
				}
				icon={<Users size={20} aria-hidden="true" />}
				className="flex-col sm:flex-row"
				action={
					<div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
						<span className="whitespace-nowrap rounded-full bg-muted px-3 py-1 font-semibold text-sm">
							{invited?.length ?? 0} peserta
						</span>
						<Button
							variant="outline"
							size="sm"
							aria-expanded={invitationsOpen}
							aria-controls="event-invitations"
							onClick={() =>
								setInvitationToggle({
									eventId,
									status: event.status,
									open: !invitationsOpen,
								})
							}
						>
							{invitationsOpen ? "Sembunyikan" : "Lihat undangan"}
						</Button>
					</div>
				}
			/>
			<CardContent
				id="event-invitations"
				hidden={!invitationsOpen}
				className="space-y-3"
			>
				<label htmlFor="invitation-search" className="block space-y-2 text-sm">
					Cari nama atau NIM
					<Input
						id="invitation-search"
						type="search"
						value={invitationSearch}
						onChange={(e) => {
							setInvitationSearch(e.target.value);
							setInvitationPage(1);
						}}
					/>
				</label>
				{event.status === "DRAFT" && preview.isPending && (
					<p role="status" className="text-muted-foreground text-sm">
						Memuat preview peserta…
					</p>
				)}
				{event.status === "DRAFT" && preview.error && (
					<div className="space-y-3">
						<p role="alert" className="text-destructive text-sm">
							Preview peserta gagal dimuat.
						</p>
						<Button
							variant="outline"
							disabled={preview.isFetching}
							loading={preview.isFetching}
							onClick={() => preview.refetch()}
						>
							{preview.isFetching ? "Memuat peserta…" : "Coba kembali"}
						</Button>
					</div>
				)}
				{event.status === "DRAFT" &&
					(preview.data?.invalidAssignmentCount ?? 0) > 0 && (
						<p role="alert" className="text-sm text-warning">
							Akun dengan penempatan organisasi tidak valid dikecualikan.
							Hubungi pengelola akun.
						</p>
					)}
				{invited?.length === 0 && (
					<p className="py-4 text-center text-muted-foreground text-sm">
						Belum ada peserta dalam daftar undangan.
					</p>
				)}
				{Boolean(invited?.length) && visibleInvitations.matching === 0 && (
					<p className="py-4 text-muted-foreground text-sm">
						Tidak ada peserta yang sesuai dengan pencarian.
					</p>
				)}
				{Boolean(invited?.length) && (
					<div className="overflow-x-auto rounded-lg border border-border">
						<table className="w-full text-left text-sm">
							<caption className="sr-only">Peserta yang diundang</caption>
							<thead>
								<tr className="border-border border-b bg-muted/50">
									<th scope="col" className="p-3">
										Peserta
									</th>
									<th scope="col" className="p-3">
										Departemen / Jabatan
									</th>
									<th scope="col" className="p-3">
										Gedung
									</th>
								</tr>
							</thead>
							<tbody>
								{visibleInvitations.rows.map((sr) => (
									<tr
										key={sr.userId}
										className="border-border border-b last:border-0"
									>
										<td className="p-3">
											<p className="font-medium">{sr.name}</p>
											<p className="text-muted-foreground text-xs">{sr.nim}</p>
										</td>
										<td className="whitespace-nowrap p-3">
											{sr.departmentCode} / {sr.positionCode}
											{event.organizationContext === "COMMITTEE" && (
												<p className="text-muted-foreground text-xs">
													{sr.committeeDivision
														? `${sr.committeeDivision} / ${committeePositionLabels[sr.committeePosition ?? ""] ?? sr.committeePosition}`
														: "Non-Panitia / Undangan"}
												</p>
											)}
										</td>
										<td className="whitespace-nowrap p-3">{sr.buildingName}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-muted-foreground text-sm">
						Halaman {visibleInvitations.page} dari {visibleInvitations.pages} ·{" "}
						{visibleInvitations.matching} peserta
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={visibleInvitations.page === 1}
							onClick={() => setInvitationPage(visibleInvitations.page - 1)}
						>
							Sebelumnya
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={visibleInvitations.page === visibleInvitations.pages}
							onClick={() => setInvitationPage(visibleInvitations.page + 1)}
						>
							Berikutnya
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
