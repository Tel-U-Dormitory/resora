import { Card, CardContent } from "@resora/ui/components/card";
import {
	ArrowUpRight,
	ClipboardCheck,
	House,
	ShieldAlert,
	UserCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	DashboardMetric,
	DashboardMetricState,
} from "./dashboard.contracts";

export type DashboardDetailHref =
	| "/penilaian"
	| "/events/points"
	| "/attendance/history"
	| "/events"
	| "/profile";

const numberFormat = new Intl.NumberFormat("id-ID", {
	maximumFractionDigits: 1,
});
const icons = {
	assessment: ClipboardCheck,
	attendance: UserCheck,
	violations: ShieldAlert,
	cleanliness: House,
};
const scopes = {
	individual: "Pribadi",
	department: "Departemen",
	organization: "Seluruh departemen",
};
function stateLabel(state: DashboardMetricState) {
	switch (state.kind) {
		case "loading":
		case "error":
		case "empty":
		case "not_assessed":
		case "missing_period":
		case "coming_soon":
		case "unavailable":
		case "forbidden":
		case "stale":
			return state.message;
		case "ready":
		case "ready_summary":
			return state.note;
	}
}

function secondarySubtitle(
	metric: DashboardMetric,
	state: DashboardMetricState,
): string {
	if (state.kind === "loading") return "Memuat…";
	if (state.kind === "ready_summary") {
		const secondary =
			state.values.find((item, index) => index > 0 && item.unit === "%") ??
			state.values[1];
		if (secondary) {
			const unit = secondary.unit?.trim();
			if (unit === "%") {
				const shortLabel =
					metric.id === "assessment"
						? "selesai"
						: metric.id === "attendance"
							? "hadir"
							: secondary.label.toLowerCase();
				return `${numberFormat.format(secondary.value)}% ${shortLabel}`;
			}
			const formattedUnit = unit ? ` ${unit}` : "";
			return `${numberFormat.format(secondary.value)}${formattedUnit} ${secondary.label}`;
		}
		return scopes[metric.scope];
	}
	if (state.kind === "ready") {
		return state.note ?? scopes[metric.scope];
	}
	return stateLabel(state) ?? "Belum tersedia";
}

function miniBarPercentage(
	metric: DashboardMetric,
	state: DashboardMetricState,
): number | null {
	if (state.kind === "ready_summary") {
		const pctItem = state.values.find((item) => item.unit?.trim() === "%");
		if (pctItem && Number.isFinite(pctItem.value)) {
			return Math.min(100, Math.max(4, Math.round(pctItem.value)));
		}
		const primary = state.values[0];
		if (primary?.unit?.trim() === "/100" && Number.isFinite(primary.value)) {
			return Math.min(100, Math.max(4, Math.round(primary.value)));
		}
	}
	if (state.kind === "ready" && metric.id === "assessment") {
		return Math.min(100, Math.max(4, Math.round(state.value)));
	}
	return null;
}

function unitSuffix(
	metric: DashboardMetric,
	state: DashboardMetricState,
	primarySummary?: { label: string; value: number; unit?: string | null },
): string {
	if (state.kind === "ready_summary" && primarySummary) {
		if (primarySummary.unit?.trim()) return primarySummary.unit.trim();
		if (metric.id === "attendance") return "kegiatan";
		return "";
	}
	if (state.kind === "ready") {
		return state.unit?.trim() ?? "";
	}
	return "";
}

export function DashboardMetricCard({
	metric,
	preview = false,
	onExport,
	onSelect,
}: {
	metric: DashboardMetric;
	preview?: boolean;
	onExport?: () => void;
	onSelect?: () => void;
}) {
	const state: DashboardMetricState =
		metric.id === "cleanliness"
			? { kind: "coming_soon", message: "Segera hadir" }
			: metric.state;
	const Icon = icons[metric.id];
	const ready = state.kind === "ready" || state.kind === "ready_summary";
	const primarySummary =
		state.kind === "ready_summary" ? state.values[0] : undefined;
	const numericValue =
		state.kind === "ready"
			? state.value
			: state.kind === "ready_summary"
				? primarySummary?.value
				: undefined;
	const isViolationAlert =
		metric.id === "violations" &&
		typeof numericValue === "number" &&
		numericValue > 0;
	const isComingSoonLike =
		state.kind === "coming_soon" || state.kind === "unavailable";
	const interactive = Boolean(onSelect) && !isComingSoonLike;
	const progressPct = miniBarPercentage(metric, state);
	const unit = unitSuffix(metric, state, primarySummary);

	return (
		<Card
			className="resora-metric-card focus-ring h-full min-w-0"
			data-metric={metric.id}
			data-state={state.kind}
			data-alert={isViolationAlert ? "true" : undefined}
			role={interactive ? "button" : undefined}
			tabIndex={interactive ? 0 : undefined}
			aria-label={
				interactive ? `Lihat detail dashboard ${metric.title}` : undefined
			}
			onClick={interactive ? onSelect : undefined}
			onKeyDown={
				interactive && onSelect
					? (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onSelect();
							}
						}
					: undefined
			}
		>
			<CardContent className="flex h-full flex-col justify-between gap-3 p-3.5 sm:p-4">
				<div className="flex items-center justify-between gap-2">
					<span className="resora-metric-icon" data-tone={metric.id}>
						<Icon size={18} aria-hidden="true" />
					</span>
					{interactive && (
						<span className="resora-metric-drill" aria-hidden="true">
							<ArrowUpRight size={15} aria-hidden="true" />
						</span>
					)}
				</div>

				{isComingSoonLike ? (
					<div className="space-y-3">
						<div className="space-y-0.5">
							<h3
								className={`resora-metric-title truncate ${isViolationAlert ? "resora-metric-alert-text" : ""}`}
							>
								{metric.title}
							</h3>
							<p className="resora-metric-substat line-clamp-2">
								Modul belum aktif
							</p>
						</div>
						<span className="inline-flex w-fit items-center rounded-lg border border-border bg-surface px-2.5 py-0.5 font-semibold text-[11px] text-muted-foreground">
							Segera hadir
						</span>
					</div>
				) : (
					<div className="space-y-1.5">
						<h3
							className={`resora-metric-title truncate ${isViolationAlert ? "resora-metric-alert-text" : ""}`}
						>
							{metric.title}
						</h3>
						{state.kind === "loading" ? (
							<Skeleton className="h-7 w-16" />
						) : state.kind === "ready" ? (
							<div className="flex items-baseline gap-1">
								<span className="resora-metric-value">
									{numberFormat.format(state.value)}
								</span>
								{unit && (
									<span className="font-medium text-muted-foreground text-xs">
										{unit}
									</span>
								)}
							</div>
						) : state.kind === "ready_summary" && primarySummary ? (
							<div className="flex items-baseline gap-1">
								<span className="resora-metric-value">
									{numberFormat.format(primarySummary.value)}
								</span>
								{unit && (
									<span className="font-medium text-muted-foreground text-xs">
										{unit}
									</span>
								)}
							</div>
						) : (
							<div className="font-bold text-lg text-muted-foreground leading-none">
								—
							</div>
						)}

						{metric.id === "violations" && ready && (
							<div className="grid grid-cols-3 gap-1 pt-0.5" aria-hidden="true">
								<span className="h-1.5 rounded-full bg-primary" />
								<span className="h-1.5 rounded-full bg-accent" />
								<span className="h-1.5 rounded-full bg-border-control/60" />
							</div>
						)}
						{metric.id !== "violations" && progressPct !== null && (
							<div
								className="h-1.5 overflow-hidden rounded-full bg-surface-subtle"
								aria-hidden="true"
							>
								<div
									className={`h-full rounded-full ${metric.id === "assessment" ? "bg-accent" : "bg-primary"}`}
									style={{ width: `${progressPct}%` }}
								/>
							</div>
						)}

						<p
							className={`resora-metric-substat line-clamp-2 ${isViolationAlert ? "resora-metric-alert-text" : ""}`}
						>
							{secondarySubtitle(metric, state)}
						</p>
					</div>
				)}

				<div className="sr-only">
					{state.kind === "loading" ? (
						<div role="status" aria-label={state.message}>
							{state.message}
						</div>
					) : state.kind === "ready_summary" ? (
						<dl>
							{state.values.map((item) => (
								<div key={item.label}>
									<dt>{item.label}</dt>
									<dd>
										{numberFormat.format(item.value)}
										{item.unit ?? ""}
									</dd>
								</div>
							))}
						</dl>
					) : state.kind === "ready" ? (
						state.note && <p>{state.note}</p>
					) : (
						<div
							role={
								state.kind === "forbidden" || state.kind === "error"
									? "alert"
									: "status"
							}
						>
							<p>{stateLabel(state)}</p>
						</div>
					)}
					{metric.id !== "cleanliness" && (
						<>
							<span>{scopes[metric.scope]}</span>
							<span>{metric.period.label}</span>
							{metric.export &&
								preview &&
								ready &&
								metric.period.startsAt &&
								metric.period.endsAt && (
									<>
										<button
											type="button"
											disabled={!onExport}
											onClick={onExport}
										>
											{onExport ? "Ekspor contoh" : "Ekspor (simulasi)"}
										</button>
										<p>
											{onExport
												? "File contoh sintetis, bukan laporan operasional."
												: "Ekspor belum tersedia pada preview."}
										</p>
									</>
								)}
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
