"use client";
import { useQuery } from "@tanstack/react-query";
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
				<p role={query.error ? "alert" : "status"}>
					{query.error
						? previewFailureState(query.error).message
						: "Memuat pengumuman…"}
				</p>
				{query.error && (
					<button
						type="button"
						className="focus-ring min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
						onClick={() => void query.refetch()}
					>
						Muat ulang pengumuman
					</button>
				)}
			</section>
		);
	return <BroadcastFeed view="LATEST" canManage={false} preview={query.data} />;
}
