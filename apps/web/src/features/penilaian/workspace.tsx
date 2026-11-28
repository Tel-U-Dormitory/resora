"use client";

import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/utils/trpc";
import { PenilaianAdminPanel } from "./penilaian-admin-panel";
import { PenilaianAnalyticsPanel } from "./penilaian-analytics-panel";
import { PenilaianInputPanel } from "./penilaian-input-panel";
import { PenilaianPointsPanel } from "./penilaian-points-panel";
import { PenilaianRecapPanel } from "./penilaian-recap-panel";
import {
	formatPeriodStatusLabel,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
} from "./penilaian-ui";

type TabId = "recap" | "input" | "points" | "analytics" | "manage";

export function PenilaianWorkspace() {
	const searchParams = useSearchParams();
	const urlTab = searchParams.get("tab") as TabId | null;
	const [selectedPeriodId, setSelectedPeriodId] = useState("");
	const [requestedTab, setRequestedTab] = useState<TabId | null>(urlTab);

	const capsQuery = useQuery({
		...trpc.penilaian.myCapabilities.queryOptions(),
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const periodsQuery = useQuery({
		...trpc.penilaian.listPeriods.queryOptions(),
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const activePeriod = useMemo(() => {
		const list = periodsQuery.data ?? [];
		if (selectedPeriodId) {
			const match = list.find((p) => p.id === selectedPeriodId);
			if (match) return match;
		}
		return list.find((p) => p.isActive) ?? list[0] ?? null;
	}, [periodsQuery.data, selectedPeriodId]);

	const caps = capsQuery.data;

	const ownRecapQuery = useQuery({
		...trpc.penilaian.ownRecap.queryOptions(
			activePeriod ? { evaluationPeriodId: activePeriod.id } : {},
		),
		enabled: Boolean(caps?.isSr),
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const canSeeAnalytics = Boolean(
		caps &&
			activePeriod &&
			(caps.canViewPreFinal ||
				(caps.canViewAllFinal && activePeriod.status === "FINAL")),
	);
	const canManageTab = Boolean(
		caps && (caps.canManageGovernance || caps.canManageRoutine),
	);

	const availableTabs = useMemo(() => {
		const tabs: Array<{ id: TabId; label: string }> = [];
		if (caps?.isSr) {
			tabs.push({ id: "recap", label: "Rekap Pribadi" });
			tabs.push({ id: "input", label: "Input Penilaian" });
		}
		tabs.push({ id: "points", label: "Poin & Kehadiran" });
		if (canSeeAnalytics) {
			tabs.push({ id: "analytics", label: "Analitik & Rekap SR" });
		}
		if (canManageTab) {
			tabs.push({ id: "manage", label: "Kelola & Impor" });
		}
		return tabs;
	}, [caps?.isSr, canSeeAnalytics, canManageTab]);

	const activeTab: TabId =
		requestedTab && availableTabs.some((t) => t.id === requestedTab)
			? requestedTab
			: (availableTabs[0]?.id ?? "points");

	if (capsQuery.isLoading || periodsQuery.isLoading) {
		return (
			<section className="space-y-4">
				<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
					Penilaian Kinerja SR
				</h1>
				<Card>
					<CardContent className="p-5">
						<p className="text-muted-foreground text-sm">
							Memuat modul penilaian…
						</p>
					</CardContent>
				</Card>
			</section>
		);
	}

	if (capsQuery.error || periodsQuery.error) {
		return (
			<section className="space-y-4">
				<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
					Penilaian Kinerja SR
				</h1>
				<Card>
					<CardContent className="p-5">
						<p role="alert" className="text-danger text-sm">
							{penilaianErrorMessage(capsQuery.error ?? periodsQuery.error)}
						</p>
					</CardContent>
				</Card>
			</section>
		);
	}

	return (
		<section className="space-y-4 sm:space-y-5">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<h1 className="font-extrabold text-foreground text-xl sm:text-2xl">
						Penilaian Kinerja SR
					</h1>
					<p className="text-muted-foreground text-xs sm:text-sm">
						Evaluasi KPI berbobot, poin kehadiran, dan analitik performa Senior
						Resident.
					</p>
				</div>

				<div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
					{activePeriod && (
						<span
							className={`rounded-full border px-3 py-1 font-bold text-xs ${penilaianStatusBadgeClass(activePeriod.status)}`}
						>
							{formatPeriodStatusLabel(activePeriod.status)} · v
							{activePeriod.version}
						</span>
					)}
					{(periodsQuery.data?.length ?? 0) > 0 && (
						<div className="min-w-0 flex-1 sm:min-w-64 sm:flex-none">
							<label htmlFor="period-selector" className="sr-only">
								Pilih periode evaluasi
							</label>
							<Select
								id="period-selector"
								className="h-11 truncate"
								value={activePeriod?.id ?? ""}
								onChange={(event) => setSelectedPeriodId(event.target.value)}
							>
								{(periodsQuery.data ?? []).map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
										{p.isActive ? " (Aktif)" : ""}
									</option>
								))}
							</Select>
						</div>
					)}
				</div>
			</header>

			<Tabs
				value={activeTab}
				onValueChange={(next) => setRequestedTab(next as TabId)}
			>
				<TabsList aria-label="Navigasi modul penilaian SR">
					{availableTabs.map((tab) => (
						<TabsTrigger key={tab.id} value={tab.id}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{!activePeriod && activeTab !== "manage" ? (
				<Card>
					<CardContent className="space-y-2 p-5">
						<h2 className="font-bold text-base text-foreground">
							Periode Evaluasi Belum Tersedia
						</h2>
						<p role="status" className="text-muted-foreground text-sm">
							Belum ada periode evaluasi yang dibuat. Kadep HCO atau SUPERADMIN
							dapat membuat periode baru pada tab Kelola & Impor.
						</p>
					</CardContent>
				</Card>
			) : null}

			{activeTab === "recap" && caps?.isSr && (
				<PenilaianRecapPanel
					data={ownRecapQuery.data}
					isLoading={ownRecapQuery.isLoading}
					error={ownRecapQuery.error}
					onRetry={() => void ownRecapQuery.refetch()}
				/>
			)}

			{activeTab === "input" && activePeriod && caps?.isSr && (
				<PenilaianInputPanel
					evaluationPeriodId={activePeriod.id}
					canEvaluateDepartment={caps.canEvaluateDepartment}
				/>
			)}

			{activeTab === "points" && activePeriod && caps && (
				<PenilaianPointsPanel
					evaluationPeriodId={activePeriod.id}
					periodStatus={activePeriod.status}
					sidakMaxPoints={activePeriod.sidakMaxPoints}
					canManageRoutine={caps.canManageRoutine}
					canProposePoints={caps.canProposePoints}
					canApprovePoints={caps.canApprovePoints}
					canViewPreFinal={caps.canViewPreFinal}
				/>
			)}

			{activeTab === "analytics" && activePeriod && caps && (
				<PenilaianAnalyticsPanel
					evaluationPeriodId={activePeriod.id}
					canViewPreFinal={caps.canViewPreFinal}
					canViewAllFinal={caps.canViewAllFinal}
				/>
			)}

			{activeTab === "manage" && caps && (
				<PenilaianAdminPanel
					key={activePeriod?.id ?? "none"}
					selectedPeriod={activePeriod}
					canManageGovernance={caps.canManageGovernance}
					canManageRoutine={caps.canManageRoutine}
					canViewPreFinal={caps.canViewPreFinal}
					onPeriodCreated={(id) => setSelectedPeriodId(id)}
				/>
			)}
		</section>
	);
}
