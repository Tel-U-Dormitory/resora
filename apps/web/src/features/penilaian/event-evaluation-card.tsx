"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import {
	type IndicatorDraft,
	TargetEvaluationList,
} from "./penilaian-target-list";
import {
	formatTargetSubtitle,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
} from "./penilaian-ui";

const categoryLabels: Record<string, string> = {
	ANNUAL: "Event Tahunan (25%)",
	MONTHLY: "Event Bulanan (10%)",
	WEEKLY: "Event Mingguan (10%)",
};

export function EventEvaluationCard({ eventId }: { eventId: string }) {
	const queryClient = useQueryClient();
	const [drafts, setDrafts] = useState<Record<string, IndicatorDraft>>({});
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	const taskQuery = useQuery({
		...trpc.penilaian.eventEvaluationTask.queryOptions({ eventId }),
		enabled: Boolean(eventId),
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const submitEvent = useMutation({
		...trpc.penilaian.submitEventScore.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Penilaian rekan event berhasil dikirim.");
			void queryClient.invalidateQueries();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	if (taskQuery.isLoading || !taskQuery.data || !taskQuery.data.isEvaluatable) {
		return null;
	}

	const task = taskQuery.data;
	if (!task.targets.length) return null;

	const doneCount = task.targets.filter((t) => Boolean(t.submission)).length;

	return (
		<Card>
			<CardHeader
				title="Penilaian Kinerja Rekan Event (KPI SR)"
				description={`${categoryLabels[task.category] ?? task.category}${task.isMandatory ? " · Wajib" : ""} · Skala indikator 0–100 · ${doneCount}/${task.targets.length} rekan dinilai`}
				action={
					!task.canSubmit ? (
						<span
							className={`rounded-full border px-2.5 py-1 font-bold text-xs ${penilaianStatusBadgeClass("FINAL")}`}
						>
							Terkunci (FINAL)
						</span>
					) : undefined
				}
			/>
			<CardContent className="space-y-4 pt-0">
				{feedback && (
					<p
						role="status"
						className="rounded-xl border border-border bg-[var(--success-tint)] px-3.5 py-2.5 font-medium text-sm text-success"
					>
						{feedback}
					</p>
				)}
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-border bg-[var(--danger-tint)] px-3.5 py-2.5 font-medium text-danger text-sm"
					>
						{error}
					</p>
				)}

				<TargetEvaluationList
					idPrefix={`ev-detail-${eventId}`}
					targets={task.targets.map((target) => ({
						userId: target.userId,
						name: target.name,
						nim: target.nim,
						subtitle: formatTargetSubtitle({
							departmentCode: target.departmentCode,
							committeeDivision: target.committeeDivision,
							committeePosition: target.committeePosition,
							fallbackLabel: "Peserta Event",
						}),
						submission: target.submission,
					}))}
					canSubmit={task.canSubmit}
					isPending={submitEvent.isPending}
					drafts={drafts}
					onDraftChange={(userId, next) =>
						setDrafts((prev) => ({
							...prev,
							[userId]: next,
						}))
					}
					onSubmit={(userId, draft) =>
						submitEvent.mutate({
							evaluationPeriodId: task.evaluationPeriodId,
							periodEventId: task.periodEventId,
							targetUserId: userId,
							commitment: draft.commitment,
							teamwork: draft.teamwork,
							attitude: draft.attitude,
							contribution: draft.contribution,
							...(draft.comment.trim()
								? { comment: draft.comment.trim() }
								: {}),
						})
					}
					submitLabel="Kirim Nilai Event"
					commentPlaceholder="Catatan kinerja opsional (dilihat HCO & SUPERADMIN)"
					emptyMessage="Tidak ada target penilaian pada event ini."
				/>
			</CardContent>
		</Card>
	);
}
