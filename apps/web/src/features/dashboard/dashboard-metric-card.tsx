import { Card, CardContent } from "@resora/ui/components/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	DashboardMetric,
	DashboardMetricState,
} from "./dashboard.contracts";

const numberFormat = new Intl.NumberFormat("id-ID");

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
			return state.message;
		case "ready":
		case "ready_summary":
			return state.note;
	}
}

export function DashboardMetricCard({
	metric,
	preview = false,
}: {
	metric: DashboardMetric;
	preview?: boolean;
}) {
	const { state } = metric;
	const value =
		state.kind === "ready" ? numberFormat.format(state.value) : null;
	const ready = state.kind === "ready" || state.kind === "ready_summary";
	return (
		<Card className="resora-panel h-full min-w-0">
			<CardContent className="flex h-full min-h-36 flex-col gap-3 p-4 sm:p-5">
				<div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
					<h3 className="min-w-0 break-words font-medium text-muted-foreground text-sm">
						{metric.title}
					</h3>
					{metric.scope !== "individual" && (
						<span className="max-w-full break-words rounded-full bg-primary-soft px-2 py-1 text-[10px] text-primary leading-4">
							Lintas departemen
						</span>
					)}
				</div>
				{state.kind === "loading" ? (
					<div role="status" aria-label={state.message} className="space-y-3">
						<Skeleton className="h-9 w-2/3" />
						<Skeleton className="h-4 w-full" />
					</div>
				) : state.kind === "ready" ? (
					<p className="break-words font-bold text-3xl tracking-tight sm:text-4xl">
						{value}
						{state.unit && (
							<span className="ml-1 font-medium text-muted-foreground text-sm">
								{state.unit}
							</span>
						)}
					</p>
				) : state.kind === "ready_summary" ? (
					<dl className="grid grid-cols-2 gap-x-3 gap-y-4">
						{state.values.map((item) => (
							<div key={item.label} className="min-w-0 space-y-1">
								<dt className="text-muted-foreground text-xs">{item.label}</dt>
								<dd className="break-words font-bold text-xl tracking-tight sm:text-2xl">
									{numberFormat.format(item.value)}
									{item.unit && (
										<span className="ml-1 font-medium text-muted-foreground text-xs">
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
						className={`font-semibold text-sm ${state.kind === "coming_soon" ? "text-muted-foreground" : "text-foreground"}`}
					>
						{stateLabel(state)}
					</p>
				)}
				<div className="mt-auto space-y-1 border-border/70 border-t pt-3">
					<p className="text-muted-foreground text-xs">{metric.period.label}</p>
					{ready && state.note && (
						<p className="text-muted-foreground text-xs">{state.note}</p>
					)}
					{metric.export && (
						<button
							type="button"
							disabled
							className="min-h-9 cursor-not-allowed rounded-lg border border-border px-3 text-muted-foreground text-xs"
						>
							{preview ? "Ekspor (simulasi)" : "Ekspor"}
						</button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
