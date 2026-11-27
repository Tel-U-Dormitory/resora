"use client";

import { Input } from "@resora/ui/components/input";
import { Select } from "@resora/ui/components/select";
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

type IndicatorState = {
	commitment: number;
	teamwork: number;
	attitude: number;
	contribution: number;
	comment: string;
};

const defaultIndicators: IndicatorState = {
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

function IndicatorGrid({
	prefix,
	value,
	onChange,
	disabled,
}: {
	prefix: string;
	value: IndicatorState;
	onChange: (next: IndicatorState) => void;
	disabled: boolean;
}) {
	const fields = [
		{ key: "commitment" as const, label: "Komitmen (0–100)" },
		{ key: "teamwork" as const, label: "Teamwork (0–100)" },
		{ key: "attitude" as const, label: "Sikap (0–100)" },
		{ key: "contribution" as const, label: "Kontribusi (0–100)" },
	];
	return (
		<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			{fields.map((field) => {
				const id = `${prefix}-${field.key}`;
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
							disabled={disabled}
							className="min-h-11"
							value={value[field.key]}
							onChange={(event) => {
								const parsed = Number(event.target.value);
								onChange({
									...value,
									[field.key]: Number.isFinite(parsed)
										? Math.min(100, Math.max(0, Math.round(parsed)))
										: 0,
								});
							}}
						/>
					</div>
				);
			})}
		</div>
	);
}

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
		Record<string, IndicatorState>
	>({});
	const [deptDrafts, setDeptDrafts] = useState<Record<string, IndicatorState>>(
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
		<div className="space-y-4">
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

			<Card>
				<CardContent className="space-y-4 p-5">
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
						<p className="text-muted-foreground text-sm">
							Memuat daftar tugas penilaian event…
						</p>
					) : eventTasks.error ? (
						<p role="alert" className="text-danger text-sm">
							{penilaianErrorMessage(eventTasks.error)}
						</p>
					) : !eventTasks.data?.length ? (
						<p role="status" className="text-muted-foreground text-sm">
							Belum ada event pada periode ini yang menugaskanmu sebagai
							penilai.
						</p>
					) : (
						<div className="space-y-4">
							{eventTasks.data.map((task) => (
								<div
									key={task.periodEventId}
									className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<h3 className="font-bold text-foreground text-sm">
												{task.title}
											</h3>
											<p className="text-muted-foreground text-xs">
												{categoryLabels[task.category] ?? task.category}
												{task.isMandatory ? " · Wajib" : ""}
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

									<div className="space-y-2.5">
										{task.targets.map((target) => {
											const key = `${task.periodEventId}:${target.userId}`;
											const draft = eventDrafts[key] ?? defaultIndicators;
											return (
												<div
													key={key}
													className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5"
												>
													<div className="flex flex-wrap items-center justify-between gap-2">
														<div>
															<p className="font-semibold text-foreground text-sm">
																{target.name} · {target.nim}
															</p>
															<p className="text-muted-foreground text-xs">
																{target.departmentCode} · Panitia:{" "}
																{target.committeeDivision} (
																{target.committeePosition})
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
															Komitmen: {target.submission.commitment} ·
															Teamwork: {target.submission.teamwork} · Sikap:{" "}
															{target.submission.attitude} · Kontribusi:{" "}
															{target.submission.contribution}
														</p>
													) : (
														<div className="space-y-2.5">
															<IndicatorGrid
																prefix={`evt-${key}`}
																value={draft}
																disabled={
																	!task.canSubmit || submitEvent.isPending
																}
																onChange={(next) =>
																	setEventDrafts((prev) => ({
																		...prev,
																		[key]: next,
																	}))
																}
															/>
															<Textarea
																aria-label={`Catatan untuk ${target.name}`}
																placeholder="Catatan kinerja opsional (dilihat HCO & SUPERADMIN)"
																disabled={
																	!task.canSubmit || submitEvent.isPending
																}
																value={draft.comment}
																onChange={(event) =>
																	setEventDrafts((prev) => ({
																		...prev,
																		[key]: {
																			...draft,
																			comment: event.target.value,
																		},
																	}))
																}
															/>
															<Button
																type="button"
																className="min-h-11"
																disabled={
																	!task.canSubmit || submitEvent.isPending
																}
																onClick={() =>
																	submitEvent.mutate({
																		evaluationPeriodId,
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
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{canEvaluateDepartment && (
				<Card>
					<CardContent className="space-y-4 p-5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 className="font-bold text-base text-foreground">
									Penilaian Departemen (25%)
								</h2>
								<p className="text-muted-foreground text-xs">
									Anggota oleh Kadep terkait, Kadep oleh Inti, dan Inti oleh
									rekan Inti.
								</p>
							</div>
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
						</div>

						{departmentTasks.isLoading ? (
							<p className="text-muted-foreground text-sm">
								Memuat daftar anggota departemen…
							</p>
						) : departmentTasks.error ? (
							<p role="alert" className="text-danger text-sm">
								{penilaianErrorMessage(departmentTasks.error)}
							</p>
						) : !departmentTasks.data?.targets.length ? (
							<p role="status" className="text-muted-foreground text-sm">
								Tidak ada target penilaian departemen yang menjadi kewenanganmu
								pada periode ini.
							</p>
						) : (
							<div className="space-y-3">
								{departmentTasks.data.targets.map((target) => {
									const key = `${quarterNumber}:${target.userId}`;
									const draft = deptDrafts[key] ?? defaultIndicators;
									return (
										<div
											key={key}
											className="space-y-2.5 rounded-xl border border-border bg-surface-subtle p-3.5"
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div>
													<p className="font-semibold text-foreground text-sm">
														{target.name} · {target.nim}
													</p>
													<p className="text-muted-foreground text-xs">
														{target.departmentCode} · {target.positionCode} ·{" "}
														{target.buildingName}
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
													<IndicatorGrid
														prefix={`dept-${key}`}
														value={draft}
														disabled={
															!departmentTasks.data.canSubmit ||
															submitDepartment.isPending
														}
														onChange={(next) =>
															setDeptDrafts((prev) => ({
																...prev,
																[key]: next,
															}))
														}
													/>
													<Textarea
														aria-label={`Catatan departemen untuk ${target.name}`}
														placeholder="Catatan evaluasi departemen opsional"
														disabled={
															!departmentTasks.data.canSubmit ||
															submitDepartment.isPending
														}
														value={draft.comment}
														onChange={(event) =>
															setDeptDrafts((prev) => ({
																...prev,
																[key]: {
																	...draft,
																	comment: event.target.value,
																},
															}))
														}
													/>
													<Button
														type="button"
														className="min-h-11"
														disabled={
															!departmentTasks.data.canSubmit ||
															submitDepartment.isPending
														}
														onClick={() =>
															submitDepartment.mutate({
																evaluationPeriodId,
																quarterNumber,
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
														Kirim Nilai Departemen
													</Button>
												</div>
											)}
										</div>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
