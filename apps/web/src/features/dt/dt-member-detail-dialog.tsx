"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import {
	dtErrorMessage,
	dtStatusBadgeClass,
	dtStatusLabel,
	formatDtAuditAction,
	formatDtDateTime,
	formatDtPeriodRange,
} from "./dt-ui";

export function DtMemberDetailDialog({
	membershipId,
	onClose,
}: {
	membershipId: string;
	onClose: () => void;
}) {
	const titleRef = useRef<HTMLHeadingElement>(null);
	const detail = useQuery({
		...trpc.dt.detail.queryOptions({ membershipId }),
		meta: { errorHandledLocally: true },
	});

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="resora-admin-dialog max-h-[90dvh] max-w-3xl overflow-y-auto"
				initialFocus={titleRef}
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<DialogTitle
							ref={titleRef}
							tabIndex={-1}
							className="font-semibold text-xl outline-none"
						>
							{detail.data?.membership.name ?? "Detail anggota Dorm Team"}
						</DialogTitle>
						<DialogDescription className="mt-1 text-muted-foreground text-sm">
							{detail.data
								? `NIM ${detail.data.membership.nim} · ${detail.data.membership.email}`
								: "Memuat riwayat periode, penugasan, dan partisipasi…"}
						</DialogDescription>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label="Tutup detail"
						onClick={onClose}
						className="size-10 shrink-0 rounded-full"
					>
						<X size={16} aria-hidden="true" />
					</Button>
				</div>

				{detail.isPending ? (
					<p role="status" className="mt-4 text-muted-foreground text-sm">
						Memuat detail Dorm Team…
					</p>
				) : detail.isError || !detail.data ? (
					<div role="alert" className="mt-4 space-y-3">
						<p className="text-danger text-sm">
							{dtErrorMessage(detail.error)}
						</p>
						<Button variant="outline" onClick={() => void detail.refetch()}>
							Coba kembali
						</Button>
					</div>
				) : (
					<div className="mt-5 space-y-5">
						<Card>
							<CardContent className="space-y-3 p-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-semibold text-sm">
										Periode: {detail.data.membership.periodName}
									</span>
									<span
										className={`rounded-full border px-2.5 py-0.5 font-semibold text-xs ${dtStatusBadgeClass(detail.data.membership.effectiveStatus)}`}
									>
										{dtStatusLabel(detail.data.membership.effectiveStatus)}
									</span>
								</div>
								<dl className="grid gap-3 text-sm sm:grid-cols-2">
									<div>
										<dt className="text-muted-foreground text-xs">
											Masa berlaku
										</dt>
										<dd className="font-medium">
											{formatDtPeriodRange(
												detail.data.membership.startsOn,
												detail.data.membership.endsOn,
											)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Departemen pembina
										</dt>
										<dd className="font-medium">
											{detail.data.membership.departmentName ??
												"Belum ditentukan"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Gedung tugas
										</dt>
										<dd className="font-medium">
											{detail.data.membership.buildingName ??
												"Belum ditentukan"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">
											Program kerja
										</dt>
										<dd className="font-medium">
											{detail.data.membership.workProgram ?? "Belum ditentukan"}
										</dd>
									</div>
								</dl>
								{detail.data.membership.registrationNotes && (
									<p className="text-muted-foreground text-xs">
										Catatan pendaftaran:{" "}
										{detail.data.membership.registrationNotes}
									</p>
								)}
							</CardContent>
						</Card>

						<section className="space-y-2.5">
							<h3 className="font-semibold text-base">
								Rekap Kehadiran & Kepanitiaan
							</h3>
							<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
								<div className="rounded-xl border border-border bg-surface-subtle p-3">
									<p className="text-muted-foreground text-xs">Diundang</p>
									<p className="font-bold text-lg tabular-nums">
										{detail.data.attendanceSummary.invited}
									</p>
								</div>
								<div className="rounded-xl border border-border bg-surface-subtle p-3">
									<p className="text-muted-foreground text-xs">Hadir</p>
									<p className="font-bold text-lg text-success tabular-nums">
										{detail.data.attendanceSummary.present}
									</p>
								</div>
								<div className="rounded-xl border border-border bg-surface-subtle p-3">
									<p className="text-muted-foreground text-xs">Pending</p>
									<p className="font-bold text-lg text-warning tabular-nums">
										{detail.data.attendanceSummary.pending}
									</p>
								</div>
								<div className="rounded-xl border border-border bg-surface-subtle p-3">
									<p className="text-muted-foreground text-xs">Tidak hadir</p>
									<p className="font-bold text-danger text-lg tabular-nums">
										{detail.data.attendanceSummary.absent}
									</p>
								</div>
							</div>
							<p className="text-muted-foreground text-xs">
								Skor poin partisipasi DT belum ditetapkan dan tidak dihitung
								otomatis.
							</p>
							{detail.data.committees.length > 0 && (
								<div className="space-y-1.5">
									<p className="font-medium text-muted-foreground text-xs">
										Kepanitiaan diikuti ({detail.data.committees.length})
									</p>
									<ul className="space-y-1.5 text-sm">
										{detail.data.committees.map((c) => (
											<li
												key={`${c.committeeId}-${c.divisionName}`}
												className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
											>
												<span className="font-medium">{c.committeeName}</span>
												<span className="text-muted-foreground text-xs">
													{c.divisionName} · {c.positionCode}
												</span>
											</li>
										))}
									</ul>
								</div>
							)}
						</section>

						<section className="space-y-2.5">
							<h3 className="font-semibold text-base">
								Riwayat Penugasan ({detail.data.assignmentHistory.length})
							</h3>
							{detail.data.assignmentHistory.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									Belum ada riwayat penugasan tercatat.
								</p>
							) : (
								<ul className="space-y-2 text-sm">
									{detail.data.assignmentHistory.map((item) => (
										<li
											key={item.id}
											className="space-y-1 rounded-xl border border-border p-3"
										>
											<p className="font-medium">
												{item.departmentName ?? "Tanpa departemen"} ·{" "}
												{item.buildingName ?? "Tanpa gedung"}
												{item.workProgram ? ` · ${item.workProgram}` : ""}
											</p>
											<p className="text-muted-foreground text-xs">
												{formatDtDateTime(item.effectiveFrom)} s/d{" "}
												{item.effectiveTo
													? formatDtDateTime(item.effectiveTo)
													: "Berjalan"}
											</p>
											<p className="text-xs">Alasan: {item.reason}</p>
										</li>
									))}
								</ul>
							)}
						</section>

						<section className="space-y-2.5">
							<h3 className="font-semibold text-base">
								Riwayat Periode Akun ({detail.data.periodHistory.length})
							</h3>
							<ul className="space-y-2 text-sm">
								{detail.data.periodHistory.map((p) => (
									<li
										key={p.id}
										className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
									>
										<div>
											<p className="font-medium">{p.periodName}</p>
											<p className="text-muted-foreground text-xs">
												{formatDtPeriodRange(p.startsOn, p.endsOn)}
											</p>
										</div>
										<span
											className={`rounded-full border px-2.5 py-0.5 font-semibold text-xs ${dtStatusBadgeClass(p.effectiveStatus)}`}
										>
											{dtStatusLabel(p.effectiveStatus)}
										</span>
									</li>
								))}
							</ul>
						</section>

						<section className="space-y-2.5">
							<h3 className="font-semibold text-base">
								Jejak Audit ({detail.data.audits.length})
							</h3>
							<ul className="space-y-2 text-xs">
								{detail.data.audits.map((audit) => (
									<li
										key={audit.id}
										className="space-y-0.5 rounded-xl border border-border bg-surface-subtle p-3"
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<span className="font-semibold text-foreground">
												{formatDtAuditAction(audit.action)}
											</span>
											<span className="text-muted-foreground">
												{formatDtDateTime(audit.createdAt)}
											</span>
										</div>
										<p className="text-muted-foreground">
											Oleh {audit.actorName} — {audit.reason}
										</p>
									</li>
								))}
							</ul>
						</section>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
