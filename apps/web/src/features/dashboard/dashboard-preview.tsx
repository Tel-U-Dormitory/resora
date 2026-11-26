"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardHeader } from "@/components/dashboard-header";
import type { DashboardFixture, DashboardMode } from "./dashboard.contracts";
import { DashboardMetrics } from "./dashboard-metrics";
import { DashboardPreviewProvider } from "./dashboard-preview-context";

export function DashboardPreview({
	fixtures,
}: {
	fixtures: Partial<Record<DashboardMode, DashboardFixture>>;
}) {
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
				</aside>
				<DashboardPreviewProvider
					key={actor}
					fixtures={canManage ? fixtures : { personal: fixtures.personal }}
					canManage={canManage}
					initialMode={canManage ? "management" : "personal"}
				>
					<DashboardMetrics showCleanliness={isSr} />
				</DashboardPreviewProvider>
			</section>
		</AppShell>
	);
}
