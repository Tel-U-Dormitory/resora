"use client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { BroadcastFeed } from "@/features/broadcast/public";
import {
	previewFailureState,
	requestDashboardBroadcasts,
} from "./dashboard-preview-api";
import { useDashboardPreview } from "./dashboard-preview-context";
export function DashboardPreviewBroadcasts() {
	const { fixture, identityKey, previewMode, scenarios } =
		useDashboardPreview();
	const query = useQuery({
		queryKey: [
			"dashboard-preview",
			identityKey,
			previewMode,
			"broadcasts",
			scenarios.broadcasts ?? "ready",
		],
		queryFn: ({ signal }) => {
			if (!fixture) throw new Error("Preview disabled");
			return requestDashboardBroadcasts(fixture, scenarios.broadcasts, signal);
		},
		enabled: !!fixture,
		retry: false,
		gcTime: 0,
		meta: { errorHandledLocally: true },
	});
	if (query.isPending || query.error)
		return (
			<section aria-label="Pengumuman SR" className="space-y-3">
				<h2 className="font-semibold text-lg">Pengumuman SR</h2>
				{query.isPending ? (
					<div role="status" className="space-y-3">
						<p className="sr-only">Memuat pengumuman…</p>
						<Skeleton className="h-28 w-full rounded-2xl" />
						<Skeleton className="h-28 w-full rounded-2xl" />
					</div>
				) : (
					<>
						<p role="alert" className="text-destructive text-sm">
							{previewFailureState(query.error).message}
						</p>
						<button
							type="button"
							className="focus-ring min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
							onClick={() => void query.refetch()}
						>
							Muat ulang pengumuman
						</button>
					</>
				)}
			</section>
		);
	return <BroadcastFeed view="LATEST" canManage={false} preview={query.data} />;
}
