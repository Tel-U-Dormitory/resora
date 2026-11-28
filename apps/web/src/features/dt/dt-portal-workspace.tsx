"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, History, QrCode } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/utils/trpc";
import {
	dtErrorMessage,
	dtStatusBadgeClass,
	dtStatusLabel,
	formatDtDateTime,
	formatDtPeriodRange,
} from "./dt-ui";

type PortalTab = "participation" | "history";

export function DtPortalWorkspace() {
	const [activeTab, setActiveTab] = useState<PortalTab>("participation");
	const portal = useQuery({
		...trpc.dt.myPortal.queryOptions(),
		meta: { errorHandledLocally: true },
	});

	if (portal.isPending) {
		return (
			<section className="resora-page space-y-4">
				<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
					Portal Dorm Team (DT)
				</h1>
				<p role="status" className="text-muted-foreground text-sm">
					Memuat status keanggotaan dan kegiatan Dorm Team…
				</p>
			</section>
		);
	}

	if (portal.isError || !portal.data) {
		return (
			<section className="resora-page space-y-4">
				<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
					Portal Dorm Team (DT)
				</h1>
				<Card>
					<CardContent className="space-y-3 p-5">
						<p role="alert" className="text-danger text-sm">
							{dtErrorMessage(portal.error)}
						</p>
						<Button variant="outline" onClick={() => void portal.refetch()}>
							Coba kembali
						</Button>
					</CardContent>
				</Card>
			</section>
		);
	}

	const data = portal.data;
	const active = data.activeMembership;

	return (
		<section className="resora-page space-y-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
						Portal Dorm Team (DT)
					</h1>
					<p className="text-muted-foreground text-xs sm:text-sm">
						Pantau status keanggotaan, penugasan, kepanitiaan, dan kegiatan yang
						mengundang kamu.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						href="/scan"
						className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm hover:bg-primary-hover"
					>
						<QrCode size={16} aria-hidden="true" /> Scan QR
					</Link>
					<Link
						href="/attendance/history"
						className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-control bg-surface px-4 py-2 font-semibold text-foreground text-sm hover:bg-muted"
					>
						<History size={16} aria-hidden="true" /> Riwayat kehadiran
					</Link>
				</div>
			</header>

			{active && (
				<Card>
					<CardContent className="space-y-3 p-4 sm:p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p className="text-muted-foreground text-xs">
									Status keanggotaan saat ini
								</p>
								<h2 className="font-bold text-base sm:text-lg">
									{active.periodName}
								</h2>
							</div>
							<span
								className={`rounded-full border px-3 py-1 font-semibold text-xs ${dtStatusBadgeClass(active.effectiveStatus)}`}
							>
								{dtStatusLabel(active.effectiveStatus)}
							</span>
						</div>
						<dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
							<div>
								<dt className="text-muted-foreground text-xs">Masa berlaku</dt>
								<dd className="font-medium">
									{formatDtPeriodRange(active.startsOn, active.endsOn)}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									Departemen pembina
								</dt>
								<dd className="font-medium">
									{active.departmentName ?? "Belum ditentukan"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Gedung tugas</dt>
								<dd className="font-medium">
									{active.buildingName ?? "Belum ditentukan"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Program kerja</dt>
								<dd className="font-medium">
									{active.workProgram ?? "Belum ditentukan"}
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			)}

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Card>
					<CardContent className="p-4">
						<p className="text-muted-foreground text-xs">Kegiatan diundang</p>
						<p className="mt-1 font-bold text-2xl tabular-nums">
							{data.attendanceSummary.invited}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-muted-foreground text-xs">Hadir</p>
						<p className="mt-1 font-bold text-2xl text-success tabular-nums">
							{data.attendanceSummary.present}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-muted-foreground text-xs">Pending</p>
						<p className="mt-1 font-bold text-2xl text-warning tabular-nums">
							{data.attendanceSummary.pending}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<p className="text-muted-foreground text-xs">Kepanitiaan</p>
						<p className="mt-1 font-bold text-2xl tabular-nums">
							{data.committees.length}
						</p>
					</CardContent>
				</Card>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(next) => setActiveTab(next as PortalTab)}
			>
				<TabsList aria-label="Navigasi portal Dorm Team">
					<TabsTrigger value="participation">
						Kegiatan & Kepanitiaan
					</TabsTrigger>
					<TabsTrigger value="history">Riwayat Periode & Penugasan</TabsTrigger>
				</TabsList>
			</Tabs>

			{activeTab === "participation" && (
				<div className="grid gap-4 lg:grid-cols-2">
					<Card>
						<CardContent className="space-y-3 p-4">
							<h2 className="font-semibold text-base">
								Kepanitiaan Diikuti ({data.committees.length})
							</h2>
							{data.committees.length === 0 ? (
								<EmptyState
									compact
									variant="folder"
									title="Belum tergabung kepanitiaan"
									description="Penugasan kepanitiaan event akan tampil di sini."
								/>
							) : (
								<ul className="space-y-2 text-sm">
									{data.committees.map((c) => (
										<li
											key={`${c.committeeId}-${c.divisionName}`}
											className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
										>
											<span className="font-semibold">{c.committeeName}</span>
											<span className="text-muted-foreground text-xs">
												{c.divisionName} · {c.positionCode}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardContent className="space-y-3 p-4">
							<div className="flex items-center justify-between gap-2">
								<h2 className="font-semibold text-base">
									Kegiatan Terundang ({data.events.length})
								</h2>
								<Link
									href="/events"
									className="focus-ring inline-flex items-center gap-1 rounded-md font-semibold text-primary text-xs hover:underline"
								>
									<CalendarDays size={14} aria-hidden="true" /> Semua kegiatan
								</Link>
							</div>
							{data.events.length === 0 ? (
								<EmptyState
									compact
									variant="calendar"
									title="Belum ada kegiatan yang mengundang kamu"
									description="Kegiatan yang melibatkan Dorm Team atau kepanitiaanmu akan muncul di sini."
								/>
							) : (
								<ul className="space-y-2 text-sm">
									{data.events.map((ev) => (
										<li
											key={ev.eventId}
											className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
										>
											<div className="min-w-0">
												<Link
													href={`/events/${ev.eventId}`}
													className="focus-ring block truncate font-semibold hover:text-primary"
												>
													{ev.title}
												</Link>
												<p className="text-muted-foreground text-xs">
													{formatDtDateTime(ev.startsAt)}
													{ev.committeeName ? ` · ${ev.committeeName}` : ""}
												</p>
											</div>
											<span
												className={`shrink-0 rounded-full border px-2.5 py-0.5 font-semibold text-xs ${dtStatusBadgeClass(ev.presence)}`}
											>
												{ev.presence === "PRESENT"
													? "Hadir"
													: ev.presence === "PENDING"
														? "Belum absen"
														: "Tidak hadir"}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</div>
			)}

			{activeTab === "history" && (
				<div className="grid gap-4 lg:grid-cols-2">
					<Card>
						<CardContent className="space-y-3 p-4">
							<h2 className="font-semibold text-base">
								Riwayat Periode Keanggotaan ({data.memberships.length})
							</h2>
							<ul className="space-y-2 text-sm">
								{data.memberships.map((m) => (
									<li
										key={m.id}
										className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
									>
										<div>
											<p className="font-semibold">{m.periodName}</p>
											<p className="text-muted-foreground text-xs">
												{formatDtPeriodRange(m.startsOn, m.endsOn)}
											</p>
										</div>
										<span
											className={`rounded-full border px-2.5 py-0.5 font-semibold text-xs ${dtStatusBadgeClass(m.effectiveStatus)}`}
										>
											{dtStatusLabel(m.effectiveStatus)}
										</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="space-y-3 p-4">
							<h2 className="font-semibold text-base">
								Riwayat Penugasan ({data.assignmentHistory.length})
							</h2>
							{data.assignmentHistory.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									Belum ada catatan perubahan penugasan.
								</p>
							) : (
								<ul className="space-y-2 text-sm">
									{data.assignmentHistory.map((item) => (
										<li
											key={item.id}
											className="space-y-1 rounded-xl border border-border p-3"
										>
											<p className="font-semibold">
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
											<p className="text-xs">Catatan: {item.reason}</p>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</section>
	);
}
