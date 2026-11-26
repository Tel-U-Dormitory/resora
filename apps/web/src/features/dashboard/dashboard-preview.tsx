"use client";

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
	return (
		<AppShell
			name="Akun sintetis"
			isSr={isSr}
			isSuperadmin={actor === "superadmin"}
			canManageEvents={canManage}
		>
			<section className="resora-page resora-dashboard space-y-6">
				<DashboardHeader name="Akun sintetis" isSystem={!isSr} />
				<aside
					className="space-y-3 rounded-xl border border-border bg-surface p-4"
					aria-label="Pengaturan preview"
				>
					<p className="text-sm">
						<strong>Preview dashboard terisolasi.</strong> Semua angka sintetis.
						Pilihan aktor hanya menguji tampilan; tidak mengubah akun atau izin.
					</p>
					<label className="flex flex-wrap items-center gap-3 text-sm">
						Aktor sintetis
						<select
							className="min-h-11 max-w-full rounded-xl border border-border bg-surface px-3"
							value={actor}
							onChange={(e) => setActor(e.target.value)}
						>
							<option value="personal">SR / SEKDEP / HCO non-KADEP</option>
							<option value="management">Inti / KADEP / multi-role</option>
							<option value="superadmin">SUPERADMIN</option>
						</select>
					</label>
					<details className="space-y-3">
						<summary className="focus-ring min-h-11 cursor-pointer py-3 text-sm">
							Simulasi respons API
						</summary>
						<div className="grid gap-3 sm:grid-cols-3">
							{[
								"assessment",
								"attendance",
								"violations",
								"broadcasts",
								"activities",
							].map((id) => (
								<label key={id} className="grid gap-2 text-sm">
									{id === "assessment"
										? "Penilaian"
										: id === "attendance"
											? "Kehadiran"
											: id === "violations"
												? "Pelanggaran"
												: id === "broadcasts"
													? "Pengumuman"
													: "Kegiatan"}
									<select
										aria-label={`Respons ${id}`}
										className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3"
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
												const feed = id === "broadcasts" || id === "activities";
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
					<div className="resora-dashboard-broadcasts">
						<DashboardPreviewBroadcasts />
					</div>
					<div className="resora-dashboard-activities">
						<DashboardActivities personalSr={isSr} />
					</div>
					<section
						className="resora-dashboard-quick space-y-3"
						aria-label="Akses cepat"
					>
						<h2 className="font-semibold text-lg">Akses cepat</h2>
						<p className="text-muted-foreground text-sm">
							Tujuan existing tetap memerlukan sesi dan izin yang sah.
						</p>
						<div className="flex flex-wrap gap-3">
							<Link
								href="/events"
								className="focus-ring inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm"
							>
								Lihat kegiatan
							</Link>
							{isSr && (
								<Link
									href="/attendance/history"
									className="focus-ring inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm"
								>
									Riwayat kehadiran
								</Link>
							)}
						</div>
					</section>
				</DashboardPreviewProvider>
			</section>
		</AppShell>
	);
}
