"use client";

import type { gformSourceTypeSchema } from "@resora/api/modules/penilaian/penilaian.contracts";
import { Checkbox } from "@resora/ui/components/checkbox";
import { Input } from "@resora/ui/components/input";
import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import {
	buildGformCsvPreviewRows,
	formatPenilaianScore,
	formatPeriodStatusLabel,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
	sampleGformCsvTemplate,
	triggerCsvDownload,
} from "./penilaian-ui";

type PeriodSummary = {
	id: string;
	srPeriodId: string;
	name: string;
	status: "OPEN" | "FINAL" | "REVISING";
	version: number;
	isActive: boolean;
	sidakMaxPoints: number;
	performanceThreshold: number | null;
};

type ParsedPreviewRow = ReturnType<typeof buildGformCsvPreviewRows>[number];

export function PenilaianAdminPanel({
	selectedPeriod,
	canManageGovernance,
	canManageRoutine,
	canViewPreFinal,
	onPeriodCreated,
}: {
	selectedPeriod: PeriodSummary | null;
	canManageGovernance: boolean;
	canManageRoutine: boolean;
	canViewPreFinal: boolean;
	onPeriodCreated: (periodId: string) => void;
}) {
	const queryClient = useQueryClient();
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	const [newSrPeriodId, setNewSrPeriodId] = useState("");
	const [newName, setNewName] = useState("");
	const [newSidakMax, setNewSidakMax] = useState("10");
	const [newThreshold, setNewThreshold] = useState("");
	const [newActivate, setNewActivate] = useState(true);

	const [cfgSidakMax, setCfgSidakMax] = useState(
		String(selectedPeriod?.sidakMaxPoints ?? 10),
	);
	const [cfgThreshold, setCfgThreshold] = useState(
		selectedPeriod?.performanceThreshold !== null &&
			selectedPeriod?.performanceThreshold !== undefined
			? String(selectedPeriod.performanceThreshold)
			: "",
	);
	const [cfgReason, setCfgReason] = useState("");

	const [eventCategories, setEventCategories] = useState<
		Record<
			string,
			{ category: "ANNUAL" | "MONTHLY" | "WEEKLY"; isMandatory: boolean }
		>
	>({});

	const [sourceType, setSourceType] =
		useState<z.infer<typeof gformSourceTypeSchema>>("SR_MABA");
	const [cycleNumber, setCycleNumber] = useState("1");
	const [sourceRef, setSourceRef] = useState("GForm Kuartal 1");
	const [csvText, setCsvText] = useState("");
	const [skipDuplicates, setSkipDuplicates] = useState(false);
	const [parsedRows, setParsedRows] = useState<ParsedPreviewRow[]>([]);
	const [previewData, setPreviewData] = useState<{
		totalRows: number;
		validCount: number;
		invalidCount: number;
		duplicateCount: number;
		canCommit: boolean;
		rows: Array<{
			rowNumber: number;
			status: "VALID" | "INVALID" | "DUPLICATE";
			errors: string[];
			targetNim: string;
			targetName: string | null;
			normalizedRespondentKey: string;
			totalScore: number | null;
			comment: string | null;
		}>;
	} | null>(null);

	const [governanceReason, setGovernanceReason] = useState("");
	const [corrType, setCorrType] = useState<"EVENT_SCORE" | "DEPARTMENT_SCORE">(
		"EVENT_SCORE",
	);
	const [corrScoreId, setCorrScoreId] = useState("");
	const [corrCommitment, setCorrCommitment] = useState("4");
	const [corrTeamwork, setCorrTeamwork] = useState("4");
	const [corrAttitude, setCorrAttitude] = useState("4");
	const [corrContribution, setCorrContribution] = useState("4");
	const [corrReason, setCorrReason] = useState("");

	const tenureQuery = useQuery({
		...trpc.penilaian.srTenureOptions.queryOptions(),
		enabled: canManageGovernance,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const candidateEventsQuery = useQuery({
		...trpc.penilaian.candidateEvents.queryOptions({
			evaluationPeriodId: selectedPeriod?.id ?? "",
		}),
		enabled: Boolean(selectedPeriod?.id) && canManageRoutine,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const completenessQuery = useQuery({
		...trpc.penilaian.completenessStatus.queryOptions({
			evaluationPeriodId: selectedPeriod?.id ?? "",
		}),
		enabled: Boolean(selectedPeriod?.id) && canViewPreFinal,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const gformImportsQuery = useQuery({
		...trpc.penilaian.listGformImports.queryOptions({
			evaluationPeriodId: selectedPeriod?.id ?? "",
		}),
		enabled: Boolean(selectedPeriod?.id) && canManageRoutine,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const invalidateAll = () => {
		void queryClient.invalidateQueries();
	};

	const createPeriodMutation = useMutation({
		...trpc.penilaian.createPeriod.mutationOptions(),
		onSuccess: (created) => {
			setError("");
			setFeedback(`Periode "${created.name}" berhasil dibuat.`);
			setNewName("");
			onPeriodCreated(created.id);
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const updateConfigMutation = useMutation({
		...trpc.penilaian.updatePeriodConfig.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Konfigurasi periode berhasil diperbarui.");
			setCfgReason("");
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const setActiveMutation = useMutation({
		...trpc.penilaian.setActivePeriod.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Periode berhasil ditetapkan sebagai periode aktif.");
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const configureEventMutation = useMutation({
		...trpc.penilaian.configurePeriodEvent.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Kategori event untuk penilaian berhasil disimpan.");
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const previewImportMutation = useMutation({
		...trpc.penilaian.previewGformImport.mutationOptions(),
		onSuccess: (res) => {
			setError("");
			setPreviewData(res);
			setFeedback(
				`Preview CSV selesai: ${res.validCount} valid, ${res.invalidCount} tidak valid, ${res.duplicateCount} duplikat.`,
			);
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const confirmImportMutation = useMutation({
		...trpc.penilaian.confirmGformImport.mutationOptions(),
		onSuccess: (res) => {
			setError("");
			setPreviewData(null);
			setCsvText("");
			setParsedRows([]);
			setFeedback(
				`Impor GForm berhasil: ${res.insertedCount} baris disimpan (${res.skippedDuplicates} duplikat dilewati).`,
			);
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const finalizeMutation = useMutation({
		...trpc.penilaian.finalizePeriod.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback(
				"Periode evaluasi berhasil difinalisasi dan snapshot nilai dibekukan.",
			);
			setGovernanceReason("");
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const openRevisionMutation = useMutation({
		...trpc.penilaian.openRevision.mutationOptions(),
		onSuccess: (res) => {
			setError("");
			setFeedback(
				`Revisi dibuka (Versi ${res.version}). Perubahan kembali diizinkan.`,
			);
			setGovernanceReason("");
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const correctScoreMutation = useMutation({
		...trpc.penilaian.correctScore.mutationOptions(),
		onSuccess: () => {
			setError("");
			setFeedback("Koreksi skor berhasil disimpan dan dicatat ke log audit.");
			setCorrScoreId("");
			setCorrReason("");
			invalidateAll();
		},
		onError: (err) => {
			setFeedback("");
			setError(penilaianErrorMessage(err));
		},
	});

	const handleRunPreview = () => {
		if (!selectedPeriod) return;
		const rows = buildGformCsvPreviewRows(csvText, sourceType);
		if (!rows.length) {
			setError(
				"CSV tidak memiliki baris valid. Pastikan header memakai kolom template (respondent_id, target_nim, q1..q20 atau q1..q10).",
			);
			return;
		}
		setParsedRows(rows);
		previewImportMutation.mutate({
			evaluationPeriodId: selectedPeriod.id,
			sourceType,
			cycleNumber: Number(cycleNumber) || 1,
			sourceReference: sourceRef.trim() || "GForm CSV Import",
			rows,
		});
	};

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

			{canManageGovernance && (
				<Card>
					<CardContent className="space-y-4 p-5">
						<div>
							<h2 className="font-bold text-base text-foreground">
								Buat Periode Evaluasi Baru (Kadep HCO / SUPERADMIN)
							</h2>
							<p className="text-muted-foreground text-xs">
								Periode evaluasi terhubung 1-ke-1 dengan periode menjabat SR
								resmi.
							</p>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<div className="space-y-1">
								<label
									htmlFor="new-sr-period"
									className="block font-medium text-text-secondary text-xs"
								>
									Periode Menjabat SR
								</label>
								<Select
									id="new-sr-period"
									value={newSrPeriodId}
									onChange={(event) => setNewSrPeriodId(event.target.value)}
								>
									<option value="">Pilih periode menjabat…</option>
									{(tenureQuery.data ?? []).map((opt) => (
										<option key={opt.periodId} value={opt.periodId}>
											{opt.name} ({opt.startsOn} s/d {opt.endsOn})
										</option>
									))}
								</Select>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="new-period-name"
									className="block font-medium text-text-secondary text-xs"
								>
									Nama Periode Evaluasi
								</label>
								<Input
									id="new-period-name"
									className="min-h-11"
									placeholder="Contoh: Evaluasi SR 2026/2027"
									value={newName}
									onChange={(event) => setNewName(event.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="new-sidak-max"
									className="block font-medium text-text-secondary text-xs"
								>
									Maks Poin Sidak
								</label>
								<Input
									id="new-sidak-max"
									type="number"
									min={1}
									max={100}
									className="min-h-11"
									value={newSidakMax}
									onChange={(event) => setNewSidakMax(event.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="new-threshold"
									className="block font-medium text-text-secondary text-xs"
								>
									Ambang Batas Nilai (Opsional)
								</label>
								<Input
									id="new-threshold"
									type="number"
									min={0}
									max={300}
									step={0.5}
									className="min-h-11"
									placeholder="Kosongkan jika belum diatur"
									value={newThreshold}
									onChange={(event) => setNewThreshold(event.target.value)}
								/>
							</div>
						</div>

						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="inline-flex min-h-11 items-center gap-2 text-foreground text-sm">
								<Checkbox
									id="new-activate-checkbox"
									checked={newActivate}
									onCheckedChange={(checked) =>
										setNewActivate(Boolean(checked))
									}
								/>
								<label
									htmlFor="new-activate-checkbox"
									className="cursor-pointer"
								>
									Aktifkan langsung setelah dibuat
								</label>
							</div>
							<Button
								type="button"
								className="min-h-11"
								disabled={
									!newSrPeriodId ||
									!newName.trim() ||
									createPeriodMutation.isPending
								}
								onClick={() =>
									createPeriodMutation.mutate({
										srPeriodId: newSrPeriodId,
										name: newName.trim(),
										sidakMaxPoints: Number(newSidakMax) || 10,
										performanceThreshold: newThreshold.trim()
											? Number(newThreshold)
											: null,
										isActive: newActivate,
									})
								}
							>
								Buat Periode Evaluasi
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{selectedPeriod && (
				<>
					{canManageGovernance && (
						<Card>
							<CardContent className="space-y-4 p-5">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<h2 className="font-bold text-base text-foreground">
											Tata Kelola Periode: {selectedPeriod.name}
										</h2>
										<p className="text-muted-foreground text-xs">
											Status: {formatPeriodStatusLabel(selectedPeriod.status)} ·
											Versi {selectedPeriod.version}
											{selectedPeriod.isActive ? " · Periode Aktif" : ""}
										</p>
									</div>
									{!selectedPeriod.isActive && (
										<Button
											type="button"
											variant="outline"
											className="min-h-11"
											disabled={setActiveMutation.isPending}
											onClick={() =>
												setActiveMutation.mutate({
													evaluationPeriodId: selectedPeriod.id,
												})
											}
										>
											Tetapkan sebagai Periode Aktif
										</Button>
									)}
								</div>

								<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
									<div className="space-y-1">
										<label
											htmlFor="cfg-sidak"
											className="block font-medium text-text-secondary text-xs"
										>
											Maks Poin Sidak
										</label>
										<Input
											id="cfg-sidak"
											type="number"
											min={1}
											max={100}
											className="min-h-11"
											value={cfgSidakMax}
											onChange={(event) => setCfgSidakMax(event.target.value)}
										/>
									</div>
									<div className="space-y-1">
										<label
											htmlFor="cfg-threshold"
											className="block font-medium text-text-secondary text-xs"
										>
											Ambang Batas Kelulusan (Kosongkan untuk null)
										</label>
										<Input
											id="cfg-threshold"
											type="number"
											min={0}
											max={300}
											step={0.5}
											className="min-h-11"
											value={cfgThreshold}
											onChange={(event) => setCfgThreshold(event.target.value)}
										/>
									</div>
									<div className="space-y-1">
										<label
											htmlFor="cfg-reason"
											className="block font-medium text-text-secondary text-xs"
										>
											Alasan Perubahan Konfigurasi
										</label>
										<Input
											id="cfg-reason"
											className="min-h-11"
											placeholder="Catatan audit perubahan"
											value={cfgReason}
											onChange={(event) => setCfgReason(event.target.value)}
										/>
									</div>
								</div>
								<Button
									type="button"
									variant="outline"
									className="min-h-11"
									disabled={!cfgReason.trim() || updateConfigMutation.isPending}
									onClick={() =>
										updateConfigMutation.mutate({
											evaluationPeriodId: selectedPeriod.id,
											sidakMaxPoints: Number(cfgSidakMax) || 10,
											performanceThreshold: cfgThreshold.trim()
												? Number(cfgThreshold)
												: null,
											reason: cfgReason.trim(),
										})
									}
								>
									Simpan Konfigurasi Periode
								</Button>

								{completenessQuery.data && (
									<div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div>
												<p className="font-semibold text-foreground text-sm">
													Kelengkapan Sebelum Finalisasi
												</p>
												<p className="text-muted-foreground text-xs">
													{completenessQuery.data.assessedCount} /{" "}
													{completenessQuery.data.totalRosterCount} SR lengkap ·{" "}
													{completenessQuery.data.unassessedCount} belum lengkap
												</p>
											</div>
											<span
												className={`rounded-full border px-2.5 py-1 font-bold text-xs ${penilaianStatusBadgeClass(completenessQuery.data.readinessStatus)}`}
											>
												{formatPeriodStatusLabel(
													completenessQuery.data.readinessStatus,
												)}
											</span>
										</div>

										{completenessQuery.data.incompleteMembers.length > 0 && (
											<ul className="space-y-1 text-muted-foreground text-xs">
												{completenessQuery.data.incompleteMembers
													.slice(0, 8)
													.map((m) => (
														<li key={m.userId}>
															• {m.name} ({m.nim}, {m.departmentCode}) — kurang:{" "}
															{m.missingComponents.join(", ")}
														</li>
													))}
											</ul>
										)}

										<div className="space-y-2">
											<label
												htmlFor="gov-reason"
												className="block font-medium text-text-secondary text-xs"
											>
												Alasan Finalisasi / Buka Revisi
											</label>
											<Input
												id="gov-reason"
												className="min-h-11"
												placeholder="Tuliskan catatan resmi keputusan"
												value={governanceReason}
												onChange={(event) =>
													setGovernanceReason(event.target.value)
												}
											/>
											<div className="flex flex-wrap gap-2">
												{selectedPeriod.status !== "FINAL" ? (
													<Button
														type="button"
														className="min-h-11"
														disabled={
															completenessQuery.data.readinessStatus !==
																"SIAP_DIFINALISASI" ||
															finalizeMutation.isPending
														}
														onClick={() =>
															finalizeMutation.mutate({
																evaluationPeriodId: selectedPeriod.id,
																reason:
																	governanceReason.trim() ||
																	"Finalisasi hasil penilaian KPI periode",
															})
														}
													>
														Finalisasi Periode
													</Button>
												) : (
													<Button
														type="button"
														variant="outline"
														className="min-h-11"
														disabled={
															!governanceReason.trim() ||
															openRevisionMutation.isPending
														}
														onClick={() =>
															openRevisionMutation.mutate({
																evaluationPeriodId: selectedPeriod.id,
																reason: governanceReason.trim(),
															})
														}
													>
														Buka Revisi (Versi Berikutnya)
													</Button>
												)}
											</div>
										</div>
									</div>
								)}

								{selectedPeriod.status !== "FINAL" && (
									<div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
										<h3 className="font-bold text-foreground text-sm">
											Koreksi Skor Ber-Audit (Saat OPEN / REVISING)
										</h3>
										<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
											<Select
												aria-label="Jenis skor yang dikoreksi"
												value={corrType}
												onChange={(event) =>
													setCorrType(
														event.target.value as
															| "EVENT_SCORE"
															| "DEPARTMENT_SCORE",
													)
												}
											>
												<option value="EVENT_SCORE">Skor Event</option>
												<option value="DEPARTMENT_SCORE">
													Skor Departemen
												</option>
											</Select>
											<Input
												aria-label="ID record skor"
												className="min-h-11"
												placeholder="UUID record skor"
												value={corrScoreId}
												onChange={(event) => setCorrScoreId(event.target.value)}
											/>
											<Input
												aria-label="Alasan koreksi"
												className="min-h-11"
												placeholder="Alasan koreksi (wajib)"
												value={corrReason}
												onChange={(event) => setCorrReason(event.target.value)}
											/>
										</div>
										<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
											<Input
												aria-label="Komitmen koreksi"
												type="number"
												min={1}
												max={5}
												className="min-h-11"
												value={corrCommitment}
												onChange={(event) =>
													setCorrCommitment(event.target.value)
												}
											/>
											<Input
												aria-label="Teamwork koreksi"
												type="number"
												min={1}
												max={5}
												className="min-h-11"
												value={corrTeamwork}
												onChange={(event) =>
													setCorrTeamwork(event.target.value)
												}
											/>
											<Input
												aria-label="Sikap koreksi"
												type="number"
												min={1}
												max={5}
												className="min-h-11"
												value={corrAttitude}
												onChange={(event) =>
													setCorrAttitude(event.target.value)
												}
											/>
											<Input
												aria-label="Kontribusi koreksi"
												type="number"
												min={1}
												max={5}
												className="min-h-11"
												value={corrContribution}
												onChange={(event) =>
													setCorrContribution(event.target.value)
												}
											/>
										</div>
										<Button
											type="button"
											variant="outline"
											className="min-h-11"
											disabled={
												!corrScoreId.trim() ||
												!corrReason.trim() ||
												correctScoreMutation.isPending
											}
											onClick={() =>
												correctScoreMutation.mutate({
													evaluationPeriodId: selectedPeriod.id,
													scoreType: corrType,
													scoreId: corrScoreId.trim(),
													commitment: Number(corrCommitment),
													teamwork: Number(corrTeamwork),
													attitude: Number(corrAttitude),
													contribution: Number(corrContribution),
													reason: corrReason.trim(),
												})
											}
										>
											Terapkan Koreksi Skor
										</Button>
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{canManageRoutine && (
						<>
							<Card>
								<CardContent className="space-y-4 p-5">
									<div>
										<h2 className="font-bold text-base text-foreground">
											Kategorisasi Event Penilaian (HCO)
										</h2>
										<p className="text-muted-foreground text-xs">
											Tetapkan event PUBLISHED/CLOSED ke bobot Tahunan (25%),
											Bulanan (10%), atau Mingguan (10%).
										</p>
									</div>

									{candidateEventsQuery.isLoading ? (
										<p className="text-muted-foreground text-sm">
											Memuat daftar event…
										</p>
									) : !candidateEventsQuery.data?.length ? (
										<p role="status" className="text-muted-foreground text-sm">
											Belum ada event PUBLISHED atau CLOSED dalam rentang
											periode ini.
										</p>
									) : (
										<div className="space-y-2.5">
											{candidateEventsQuery.data.map((evt) => {
												const draft = eventCategories[evt.eventId] ?? {
													category: (evt.configured?.category ?? "MONTHLY") as
														| "ANNUAL"
														| "MONTHLY"
														| "WEEKLY",
													isMandatory: evt.configured?.isMandatory ?? true,
												};
												return (
													<div
														key={evt.eventId}
														className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-3.5"
													>
														<div className="min-w-0 space-y-0.5">
															<p className="font-semibold text-foreground text-sm">
																{evt.title}
															</p>
															<p className="text-muted-foreground text-xs">
																Status event: {evt.status}
																{evt.configured
																	? ` · Terpasang: ${evt.configured.category}`
																	: " · Belum dikategorikan"}
															</p>
														</div>
														<div className="flex flex-wrap items-center gap-2">
															<div className="w-40">
																<Select
																	aria-label={`Kategori ${evt.title}`}
																	value={draft.category}
																	disabled={selectedPeriod.status === "FINAL"}
																	onChange={(event) =>
																		setEventCategories((prev) => ({
																			...prev,
																			[evt.eventId]: {
																				...draft,
																				category: event.target.value as
																					| "ANNUAL"
																					| "MONTHLY"
																					| "WEEKLY",
																			},
																		}))
																	}
																>
																	<option value="ANNUAL">Tahunan (25%)</option>
																	<option value="MONTHLY">Bulanan (10%)</option>
																	<option value="WEEKLY">Mingguan (10%)</option>
																</Select>
															</div>
															<div className="inline-flex min-h-11 items-center gap-1.5 text-xs">
																<Checkbox
																	id={`evt-mandatory-${evt.eventId}`}
																	checked={draft.isMandatory}
																	disabled={selectedPeriod.status === "FINAL"}
																	onCheckedChange={(checked) =>
																		setEventCategories((prev) => ({
																			...prev,
																			[evt.eventId]: {
																				...draft,
																				isMandatory: Boolean(checked),
																			},
																		}))
																	}
																/>
																<label
																	htmlFor={`evt-mandatory-${evt.eventId}`}
																	className="cursor-pointer"
																>
																	Wajib
																</label>
															</div>
															<Button
																type="button"
																size="sm"
																className="min-h-11"
																disabled={
																	selectedPeriod.status === "FINAL" ||
																	configureEventMutation.isPending
																}
																onClick={() =>
																	configureEventMutation.mutate({
																		evaluationPeriodId: selectedPeriod.id,
																		eventId: evt.eventId,
																		category: draft.category,
																		isMandatory: draft.isMandatory,
																	})
																}
															>
																Simpan Event
															</Button>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</CardContent>
							</Card>

							<Card>
								<CardContent className="space-y-4 p-5">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<h2 className="font-bold text-base text-foreground">
												Impor GForm SR/Maba (50%) & Eksternal ASUS/Ditmawa
											</h2>
											<p className="text-muted-foreground text-xs">
												Unggah CSV dari GForm untuk preview validasi sebelum
												commit ke database.
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="min-h-11"
											onClick={() =>
												triggerCsvDownload(
													`template-${sourceType.toLowerCase()}.csv`,
													sampleGformCsvTemplate(sourceType),
												)
											}
										>
											Unduh Template CSV
										</Button>
									</div>

									<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
										<div className="space-y-1">
											<label
												htmlFor="gf-source"
												className="block font-medium text-text-secondary text-xs"
											>
												Jenis Sumber GForm
											</label>
											<Select
												id="gf-source"
												value={sourceType}
												onChange={(event) => {
													setSourceType(
														event.target.value as z.infer<
															typeof gformSourceTypeSchema
														>,
													);
													setPreviewData(null);
												}}
											>
												<option value="SR_MABA">
													GForm SR & Maba (20 soal, bobot 50%)
												</option>
												<option value="EXTERNAL_ASUS_DITMAWA">
													Eksternal ASUS / Ditmawa (10 soal, terpisah)
												</option>
											</Select>
										</div>
										<div className="space-y-1">
											<label
												htmlFor="gf-cycle"
												className="block font-medium text-text-secondary text-xs"
											>
												Siklus / Kuartal
											</label>
											<Input
												id="gf-cycle"
												type="number"
												min={1}
												max={12}
												className="min-h-11"
												value={cycleNumber}
												onChange={(event) => setCycleNumber(event.target.value)}
											/>
										</div>
										<div className="space-y-1">
											<label
												htmlFor="gf-ref"
												className="block font-medium text-text-secondary text-xs"
											>
												Referensi Sumber
											</label>
											<Input
												id="gf-ref"
												className="min-h-11"
												value={sourceRef}
												onChange={(event) => setSourceRef(event.target.value)}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<label
											htmlFor="gf-file"
											className="block font-medium text-text-secondary text-xs"
										>
											Pilih File CSV atau Tempel Isi CSV
										</label>
										<Input
											id="gf-file"
											type="file"
											accept=".csv,text/csv"
											className="min-h-11 py-2"
											onChange={(event) => {
												const file = event.target.files?.[0];
												if (!file) return;
												void file.text().then((content) => {
													setCsvText(content);
													setPreviewData(null);
												});
											}}
										/>
										<Textarea
											aria-label="Konten CSV GForm"
											rows={5}
											placeholder="Tempel isi CSV di sini atau pilih file .csv di atas"
											value={csvText}
											onChange={(event) => {
												setCsvText(event.target.value);
												setPreviewData(null);
											}}
										/>
									</div>

									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="inline-flex min-h-11 items-center gap-2 text-xs">
											<Checkbox
												id="gf-skip-duplicates"
												checked={skipDuplicates}
												onCheckedChange={(checked) =>
													setSkipDuplicates(Boolean(checked))
												}
											/>
											<label
												htmlFor="gf-skip-duplicates"
												className="cursor-pointer"
											>
												Lewati baris duplikat saat impor
											</label>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												variant="outline"
												className="min-h-11"
												disabled={
													!csvText.trim() || previewImportMutation.isPending
												}
												onClick={handleRunPreview}
											>
												Preview Validasi CSV
											</Button>
											{previewData && (
												<Button
													type="button"
													className="min-h-11"
													disabled={
														selectedPeriod.status === "FINAL" ||
														previewData.invalidCount > 0 ||
														(!skipDuplicates &&
															previewData.duplicateCount > 0) ||
														confirmImportMutation.isPending
													}
													onClick={() =>
														confirmImportMutation.mutate({
															evaluationPeriodId: selectedPeriod.id,
															sourceType,
															cycleNumber: Number(cycleNumber) || 1,
															sourceReference:
																sourceRef.trim() || "GForm CSV Import",
															rows: parsedRows,
															skipDuplicates,
														})
													}
												>
													Konfirmasi & Simpan Impor
												</Button>
											)}
										</div>
									</div>

									{previewData && (
										<div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-3.5">
											<p className="font-semibold text-foreground text-xs">
												Hasil Preview: {previewData.validCount} valid ·{" "}
												{previewData.invalidCount} tidak valid ·{" "}
												{previewData.duplicateCount} duplikat
											</p>
											<div className="max-h-56 overflow-auto">
												<table className="w-full text-left text-xs">
													<thead>
														<tr className="border-border border-b text-muted-foreground">
															<th className="px-2 py-1.5">Baris</th>
															<th className="px-2 py-1.5">Target NIM</th>
															<th className="px-2 py-1.5">Nama</th>
															<th className="px-2 py-1.5">Skor</th>
															<th className="px-2 py-1.5">Status</th>
															<th className="px-2 py-1.5">Keterangan</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-border">
														{previewData.rows.slice(0, 50).map((row) => (
															<tr key={`${row.rowNumber}-${row.targetNim}`}>
																<td className="px-2 py-1.5 tabular-nums">
																	{row.rowNumber}
																</td>
																<td className="px-2 py-1.5 tabular-nums">
																	{row.targetNim}
																</td>
																<td className="px-2 py-1.5">
																	{row.targetName ?? "—"}
																</td>
																<td className="px-2 py-1.5 tabular-nums">
																	{formatPenilaianScore(row.totalScore)}
																</td>
																<td className="px-2 py-1.5">
																	<span
																		className={`rounded-full border px-2 py-0.5 font-bold ${penilaianStatusBadgeClass(row.status)}`}
																	>
																		{row.status}
																	</span>
																</td>
																<td className="px-2 py-1.5 text-muted-foreground">
																	{row.errors.join(", ") || "Siap disimpan"}
																</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>
									)}

									{gformImportsQuery.data &&
										gformImportsQuery.data.length > 0 && (
											<p className="text-muted-foreground text-xs">
												Total baris GForm tersimpan pada periode ini:{" "}
												<strong className="text-foreground">
													{gformImportsQuery.data.length}
												</strong>{" "}
												respons.
											</p>
										)}
								</CardContent>
							</Card>
						</>
					)}
				</>
			)}
		</div>
	);
}
