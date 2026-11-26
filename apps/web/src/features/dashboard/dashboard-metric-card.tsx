import { Card, CardContent } from "@resora/ui/components/card";
import { ClipboardCheck, House, ShieldAlert, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	DashboardMetric,
	DashboardMetricState,
} from "./dashboard.contracts";

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
export function DashboardMetricCard({
	metric,
	preview = false,
	onExport,
}: {
	metric: DashboardMetric;
	preview?: boolean;
	onExport?: () => void;
}) {
	const state: DashboardMetricState =
		metric.id === "cleanliness"
			? { kind: "coming_soon", message: "Segera hadir" }
			: metric.state;
	const Icon = icons[metric.id];
	const ready = state.kind === "ready" || state.kind === "ready_summary";
	return (
		<Card
			className="resora-panel resora-metric-card h-full min-w-0"
			data-metric={metric.id}
			data-state={state.kind}
		>
			<CardContent className="flex h-full flex-col gap-4 p-4">
				<div className="flex min-w-0 items-start gap-3">
					<span className="resora-metric-icon" data-tone={metric.id}>
						<Icon size={20} aria-hidden="true" />
					</span>
					<div className="min-w-0 space-y-1">
						<h3 className="font-semibold text-sm">{metric.title}</h3>
						<p className="text-muted-foreground text-xs">
							{scopes[metric.scope]}
						</p>
					</div>
				</div>
				{state.kind === "loading" ? (
					<div role="status" aria-label={state.message} className="space-y-3">
						<Skeleton className="h-9 w-2/3" />
						<Skeleton className="h-4 w-full" />
					</div>
				) : state.kind === "ready" ? (
					<p className="resora-metric-value">
						{numberFormat.format(state.value)}
						{state.unit && (
							<span className="ml-1 font-medium text-muted-foreground text-sm">
								{state.unit}
							</span>
						)}
					</p>
				) : state.kind === "ready_summary" ? (
					<dl className="space-y-3">
						{state.values.map((item, index) => (
							<div key={item.label} className="space-y-1">
								<dt className="text-muted-foreground text-sm">{item.label}</dt>
								<dd
									className={
										index === 0
											? "resora-metric-value"
											: "font-semibold text-lg tabular-nums"
									}
								>
									{numberFormat.format(item.value)}
									{item.unit && (
										<span className="ml-1 font-medium text-muted-foreground text-sm">
											{item.unit}
										</span>
									)}
								</dd>
							</div>
						))}
					</dl>
				) : (
					<p
						role={
							state.kind === "forbidden" || state.kind === "error"
								? "alert"
								: "status"
						}
						className="text-sm leading-relaxed"
					>
						{stateLabel(state)}
					</p>
				)}
				{metric.id !== "cleanliness" && (
					<div className="mt-auto space-y-2 border-border border-t pt-3">
						<p className="text-muted-foreground text-xs">
							{metric.period.label}
						</p>
						{ready && state.note && (
							<p className="text-muted-foreground text-xs">{state.note}</p>
						)}
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
										className="min-h-11 rounded-lg border border-border px-3 text-sm"
									>
										{onExport ? "Ekspor contoh" : "Ekspor (simulasi)"}
									</button>
									<p className="text-muted-foreground text-xs">
										{onExport
											? "File contoh sintetis, bukan laporan operasional."
											: "Ekspor belum tersedia pada preview."}
									</p>
								</>
							)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
