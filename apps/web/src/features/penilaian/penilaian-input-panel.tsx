"use client";

import { Select } from "@resora/ui/components/select";
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

export function PenilaianInputPanel({
	evaluationPeriodId,
	canEvaluateDepartment,
}: {
	evaluationPeriodId: string;
	canEvaluateDepartment: boolean;
}) {
	const queryClient = useQueryClient();
	const [quarterNumber, setQuarterNumber] = useState<number>(1);
	const [eventDrafts, setEventDrafts] = useState<
		Record<string, IndicatorDraft>
	>({});
	const [deptDrafts, setDeptDrafts] = useState<Record<string, IndicatorDraft>>(
		{},
	);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	const eventTasks = useQuery({
		...trpc.penilaian.myEventTasks.queryOptions({ evaluationPeriodId }),
		enabled: Boolean(evaluationPeriodId),
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const departmentTasks = useQuery({
		...trpc.penilaian.myDepartmentTasks.queryOptions({
			evaluationPeriodId,
			quarterNumber,
		}),
		enabled: Boolean(evaluationPeriodId) && canEvaluateDepartment,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const submitEvent = useMutation({
		...trpc.penilaian.submitEventScore.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Penilaian event berhasil dikirim.");
			void queryClient.invalidateQueries();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const submitDepartment = useMutation({
		...trpc.penilaian.submitDepartmentScore.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Penilaian departemen berhasil dikirim.");
			void queryClient.invalidateQueries();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	return (
		<div className="space-y-6">
			{feedback && (
				<p
					role="status"
					className="rounded-xl border border-border bg-[var(--success-tint)] px-4 py-3 font-medium text-sm text-success"
				>
					{feedback}
				</p>
			)}
			{error && (
				<p
					role="alert"
					className="rounded-xl border border-border bg-[var(--danger-tint)] px-4 py-3 font-medium text-danger text-sm"
				>
					{error}
				</p>
			)}

			<section className="space-y-3" aria-label="Penilaian Event">
				<div>
					<h2 className="font-bold text-base text-foreground">
						Penilaian Event
					</h2>
					<p className="text-muted-foreground text-xs">
						Nilai rekan SR peserta event yang telah dikategorikan HCO (skala
						0–100, kirim satu kali).
					</p>
				</div>

				{eventTasks.isLoading ? (
					<Card>
						<CardContent className="p-5">
							<p className="text-muted-foreground text-sm">
								Memuat daftar tugas penilaian event…
							</p>
						</CardContent>
					</Card>
				) : eventTasks.error ? (
					<Card>
						<CardContent className="p-5">
							<p role="alert" className="text-danger text-sm">
								{penilaianErrorMessage(eventTasks.error)}
							</p>
						</CardContent>
					</Card>
				) : !eventTasks.data?.length ? (
					<Card>
						<CardContent className="p-5">
							<p role="status" className="text-muted-foreground text-sm">
								Belum ada event pada periode ini yang menugaskanmu sebagai
								penilai.
							</p>
						</CardContent>
					</Card>
				) : (
					eventTasks.data.map((task) => {
						const doneCount = task.targets.filter((t) =>
							Boolean(t.submission),
						).length;
						const draftsByTarget: Record<string, IndicatorDraft> = {};
						for (const t of task.targets) {
							const d = eventDrafts[`${task.periodEventId}:${t.userId}`];
							if (d) draftsByTarget[t.userId] = d;
						}

						return (
							<Card key={task.periodEventId}>
								<CardHeader
									title={task.title}
									description={`${categoryLabels[task.category] ?? task.category}${task.isMandatory ? " · Wajib" : ""} · ${doneCount}/${task.targets.length} rekan dinilai`}
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
								<CardContent className="pt-0">
									<TargetEvaluationList
										idPrefix={`evt-${task.periodEventId}`}
										targets={task.targets.map((target) => ({
											userId: target.userId,
											name: target.name,
											nim: target.nim ?? "",
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
										drafts={draftsByTarget}
										onDraftChange={(userId, next) =>
											setEventDrafts((prev) => ({
												...prev,
												[`${task.periodEventId}:${userId}`]: next,
											}))
										}
										onSubmit={(userId, draft) =>
											submitEvent.mutate({
												evaluationPeriodId,
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
										emptyMessage="Tidak ada target rekan pada event ini."
									/>
								</CardContent>
							</Card>
						);
					})
				)}
			</section>

			{canEvaluateDepartment && (
				<section className="space-y-3" aria-label="Penilaian Departemen">
					<Card>
						<CardHeader
							title="Penilaian Departemen (25%)"
							description="Anggota oleh Kadep terkait, Kadep oleh Inti, dan Inti oleh rekan Inti."
							action={
								<div className="w-full sm:w-44">
									<label htmlFor="dept-quarter-select" className="sr-only">
										Pilih triwulan
									</label>
									<Select
										id="dept-quarter-select"
										value={String(quarterNumber)}
										onChange={(event) =>
											setQuarterNumber(Number(event.target.value))
										}
									>
										{[1, 2, 3, 4].map((q) => (
											<option key={q} value={q}>
												Triwulan {q}
											</option>
										))}
									</Select>
								</div>
							}
						/>
						<CardContent className="pt-0">
							{departmentTasks.isLoading ? (
								<p className="text-muted-foreground text-sm">
									Memuat daftar anggota departemen…
								</p>
							) : departmentTasks.error ? (
								<p role="alert" className="text-danger text-sm">
									{penilaianErrorMessage(departmentTasks.error)}
								</p>
							) : (
								<TargetEvaluationList
									idPrefix={`dept-${quarterNumber}`}
									targets={(departmentTasks.data?.targets ?? []).map(
										(target) => ({
											userId: target.userId,
											name: target.name,
											nim: target.nim ?? "",
											subtitle: `${target.departmentCode} · ${target.positionCode} · ${target.buildingName}`,
											submission: target.submission,
										}),
									)}
									canSubmit={Boolean(departmentTasks.data?.canSubmit)}
									isPending={submitDepartment.isPending}
									drafts={Object.fromEntries(
										(departmentTasks.data?.targets ?? []).flatMap((target) => {
											const d = deptDrafts[`${quarterNumber}:${target.userId}`];
											return d ? [[target.userId, d]] : [];
										}),
									)}
									onDraftChange={(userId, next) =>
										setDeptDrafts((prev) => ({
											...prev,
											[`${quarterNumber}:${userId}`]: next,
										}))
									}
									onSubmit={(userId, draft) =>
										submitDepartment.mutate({
											evaluationPeriodId,
											quarterNumber,
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
									submitLabel="Kirim Nilai Departemen"
									commentPlaceholder="Catatan evaluasi departemen opsional"
									emptyMessage="Tidak ada target penilaian departemen yang menjadi kewenanganmu pada periode ini."
								/>
							)}
						</CardContent>
					</Card>
				</section>
			)}
		</div>
	);
}
