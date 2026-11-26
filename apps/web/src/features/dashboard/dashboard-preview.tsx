"use client";

import {
	CalendarDays,
	History,
	ListChecks,
	ScanLine,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardHeader } from "@/components/dashboard-header";
import type {
	DashboardFixture,
	DashboardMode,
	DashboardScenario,
	DashboardScenarios,
} from "./dashboard.contracts";
import { DashboardActivities } from "./dashboard-activities";
import { DashboardMetrics } from "./dashboard-metrics";
import { DashboardPreviewBroadcasts } from "./dashboard-preview-broadcasts";
import { DashboardPreviewProvider } from "./dashboard-preview-context";

export function DashboardPreview({
	fixtures,
}: {
	fixtures: Partial<Record<DashboardMode, DashboardFixture>>;
}) {
	const [scenarios, setScenarios] = useState<DashboardScenarios>({});
	const [actor, setActor] = useState("management");
	const canManage = actor === "management" || actor === "superadmin";
	const isSr = actor !== "superadmin";
	const quickItems = [
		...(isSr
			? [
					{
						href: "/scan" as const,
						label: "Scan QR",
						icon: ScanLine,
						highlight: true,
					},
				]
			: []),
		{
			href: "/events" as const,
			label: "Kegiatan",
			icon: CalendarDays,
			highlight: false,
		},
		...(isSr
			? [
					{
						href: "/attendance/history" as const,
						label: "Riwayat",
						icon: History,
						highlight: false,
					},
				]
			: []),
		...(canManage
			? [
					{
						href: "/events?view=manage" as const,
						label: "Kelola event",
						icon: ListChecks,
						highlight: false,
					},
				]
			: []),
		...(actor === "superadmin"
			? [
					{
						href: "/admin/users" as const,
						label: "Kelola akun",
						icon: Users,
						highlight: false,
					},
				]
			: []),
	];

	return (
		<AppShell
			name="Akun sintetis"
			isSr={isSr}
			isSuperadmin={actor === "superadmin"}
			canManageEvents={canManage}
		>
			<section className="resora-page resora-dashboard space-y-5">
				<DashboardHeader name="Akun sintetis" isSystem={!isSr} />
				<DashboardPreviewProvider
					identityKey={actor}
					simulateRequests
					scenarios={scenarios}
					key={actor}
					fixtures={canManage ? fixtures : { personal: fixtures.personal }}
					canManage={canManage}
					initialMode={canManage ? "management" : "personal"}
				>
					<DashboardMetrics showCleanliness={isSr} />
					<section
						className="resora-dashboard-quick resora-dashboard-section space-y-3"
						aria-label="Akses cepat"
					>
						<div className="flex items-center justify-between gap-2">
							<h2 className="font-bold text-base">Akses cepat</h2>
							<Link
								href="/events"
								className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-primary text-xs hover:underline"
							>
								Semua modul
							</Link>
						</div>
						<div className="resora-quick-launchers">
							{quickItems.map(({ href, label, icon: Icon }) => {
								const tone =
									href === "/scan" || href === "/events?view=manage"
										? "coral"
										: href === "/attendance/history"
											? "purple"
											: "yellow";
								return (
									<Link
										key={href}
										href={href}
										data-tone={tone}
										className={`resora-quick-launcher focus-ring ${href === "/scan" ? "hidden min-[1200px]:flex" : ""}`}
									>
										<span className="resora-quick-circle">
											<Icon size={20} aria-hidden="true" />
										</span>
										<span className="resora-quick-label">{label}</span>
									</Link>
								);
							})}
						</div>
					</section>
					<div className="resora-dashboard-activities resora-dashboard-section">
						<DashboardActivities personalSr={isSr} />
					</div>
					<div className="resora-dashboard-broadcasts resora-dashboard-section">
						<DashboardPreviewBroadcasts />
					</div>
				</DashboardPreviewProvider>
				<aside
					className="resora-dashboard-section space-y-2.5 text-xs"
					aria-label="Pengaturan preview"
				>
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-subtle px-3 py-2">
						<span className="text-muted-foreground">
							<strong className="text-foreground">Preview terisolasi.</strong>{" "}
							Semua angka sintetis.
						</span>
						<label className="flex items-center gap-2 font-medium">
							<span>Aktor sintetis</span>
							<select
								className="min-h-9 rounded-lg border border-border bg-surface px-2.5 text-xs"
								value={actor}
								onChange={(e) => setActor(e.target.value)}
							>
								<option value="personal">SR / SEKDEP / HCO non-KADEP</option>
								<option value="management">Inti / KADEP / multi-role</option>
								<option value="superadmin">SUPERADMIN</option>
							</select>
						</label>
					</div>
					<details className="space-y-3">
						<summary className="focus-ring min-h-9 cursor-pointer py-1.5 font-medium text-muted-foreground">
							Simulasi respons API
						</summary>
						<div className="grid gap-3 pt-2 sm:grid-cols-3">
							{[
								"assessment",
								"attendance",
								"violations",
								"broadcasts",
								"activities",
								"export",
							].map((id) => (
								<label key={id} className="grid gap-1.5 text-xs">
									{id === "assessment"
										? "Penilaian"
										: id === "attendance"
											? "Kehadiran"
											: id === "violations"
												? "Pelanggaran"
												: id === "broadcasts"
													? "Pengumuman"
													: id === "activities"
														? "Kegiatan"
														: "Ekspor"}
									<select
										aria-label={`Respons ${id}`}
										className="min-h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-xs"
										value={scenarios[id as keyof DashboardScenarios] ?? "ready"}
										onChange={(e) =>
											setScenarios((previous) => ({
												...previous,
												[id]: e.target.value as DashboardScenario,
											}))
										}
									>
										{[
											["ready", "Berhasil"],
											["slow", "Lambat / loading"],
											["zero", "Nilai nol"],
											["empty", "Data kosong"],
											["not_assessed", "Belum dinilai"],
											["missing_period", "Tanpa periode"],
											["unavailable", "Belum tersedia"],
											["stale", "Data kedaluwarsa"],
											["401", "401 — sesi berakhir"],
											["403", "403 — akses ditolak"],
											["429", "429 — terlalu banyak request"],
											["500", "500 — gagal memuat"],
											["503", "503 — layanan tidak tersedia"],
											["timeout", "Timeout"],
										]
											.filter(([value]) => {
												const feed =
													id === "broadcasts" ||
													id === "activities" ||
													id === "export";
												if (feed)
													return [
														"ready",
														"slow",
														"empty",
														"401",
														"403",
														"429",
														"500",
														"503",
														"timeout",
													].includes(value);
												return value !== "not_assessed" || id === "assessment";
											})
											.map(([value, label]) => (
												<option key={value} value={value}>
													{label}
												</option>
											))}
									</select>
								</label>
							))}
						</div>
					</details>
				</aside>
			</section>
		</AppShell>
	);
}
