"use client";

import { Input } from "@resora/ui/components/input";
import { Textarea } from "@resora/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import {
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
} from "./penilaian-ui";

type IndicatorDraft = {
	commitment: number;
	teamwork: number;
	attitude: number;
	contribution: number;
	comment: string;
};

const defaultDraft: IndicatorDraft = {
	commitment: 85,
	teamwork: 85,
	attitude: 85,
	contribution: 85,
	comment: "",
};

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

	return (
		<Card>
			<CardContent className="space-y-4 p-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 className="font-bold text-base text-foreground">
							Penilaian Kinerja Rekan Event (KPI SR)
						</h2>
						<p className="text-muted-foreground text-xs">
							{categoryLabels[task.category] ?? task.category}
							{task.isMandatory ? " · Wajib" : ""} · Skala indikator 0–100
							(kirim satu kali per rekan).
						</p>
					</div>
					{!task.canSubmit && (
						<span
							className={`rounded-full border px-2.5 py-1 font-bold text-xs ${penilaianStatusBadgeClass("FINAL")}`}
						>
							Terkunci (FINAL)
						</span>
					)}
				</div>

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

				<div className="space-y-3">
					{task.targets.map((target) => {
						const draft = drafts[target.userId] ?? defaultDraft;
						return (
							<div
								key={target.userId}
								className="space-y-2.5 rounded-xl border border-border bg-surface-subtle p-3.5"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="font-semibold text-foreground text-sm">
											{target.name} · {target.nim}
										</p>
										<p className="text-muted-foreground text-xs">
											{target.departmentCode} ·{" "}
											{target.committeeDivision ?? "Umum"} (
											{target.committeePosition ?? "Peserta"})
										</p>
									</div>
									{target.submission && (
										<span
											className={`rounded-full border px-2.5 py-1 font-bold text-xs ${penilaianStatusBadgeClass("APPROVED")}`}
										>
											Sudah Dinilai
										</span>
									)}
								</div>

								{target.submission ? (
									<p className="text-muted-foreground text-xs">
										Komitmen: {target.submission.commitment} · Teamwork:{" "}
										{target.submission.teamwork} · Sikap:{" "}
										{target.submission.attitude} · Kontribusi:{" "}
										{target.submission.contribution}
									</p>
								) : (
									<div className="space-y-2.5">
										<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
											{(
												[
													{ key: "commitment", label: "Komitmen (0–100)" },
													{ key: "teamwork", label: "Teamwork (0–100)" },
													{ key: "attitude", label: "Sikap (0–100)" },
													{ key: "contribution", label: "Kontribusi (0–100)" },
												] as const
											).map((field) => {
												const id = `ev-detail-${target.userId}-${field.key}`;
												return (
													<div key={field.key} className="space-y-1">
														<label
															htmlFor={id}
															className="block font-medium text-text-secondary text-xs"
														>
															{field.label}
														</label>
														<Input
															id={id}
															type="number"
															min={0}
															max={100}
															step={1}
															disabled={
																!task.canSubmit || submitEvent.isPending
															}
															className="min-h-11"
															value={draft[field.key]}
															onChange={(event) => {
																const parsed = Number(event.target.value);
																setDrafts((prev) => ({
																	...prev,
																	[target.userId]: {
																		...draft,
																		[field.key]: Number.isFinite(parsed)
																			? Math.min(
																					100,
																					Math.max(0, Math.round(parsed)),
																				)
																			: 0,
																	},
																}));
															}}
														/>
													</div>
												);
											})}
										</div>
										<Textarea
											aria-label={`Catatan untuk ${target.name}`}
											placeholder="Catatan kinerja opsional (dilihat HCO & SUPERADMIN)"
											disabled={!task.canSubmit || submitEvent.isPending}
											value={draft.comment}
											onChange={(event) =>
												setDrafts((prev) => ({
													...prev,
													[target.userId]: {
														...draft,
														comment: event.target.value,
													},
												}))
											}
										/>
										<Button
											type="button"
											className="min-h-11"
											disabled={!task.canSubmit || submitEvent.isPending}
											onClick={() =>
												submitEvent.mutate({
													evaluationPeriodId: task.evaluationPeriodId,
													periodEventId: task.periodEventId,
													targetUserId: target.userId,
													commitment: draft.commitment,
													teamwork: draft.teamwork,
													attitude: draft.attitude,
													contribution: draft.contribution,
													...(draft.comment.trim()
														? { comment: draft.comment.trim() }
														: {}),
												})
											}
										>
											Kirim Nilai Event
										</Button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
