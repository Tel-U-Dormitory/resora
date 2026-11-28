"use client";

import { Input } from "@resora/ui/components/input";
import { Textarea } from "@resora/ui/components/textarea";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { penilaianStatusBadgeClass } from "./penilaian-ui";

export type IndicatorDraft = {
	commitment: number;
	teamwork: number;
	attitude: number;
	contribution: number;
	comment: string;
};

export const DEFAULT_INDICATOR_DRAFT: IndicatorDraft = {
	commitment: 85,
	teamwork: 85,
	attitude: 85,
	contribution: 85,
	comment: "",
};

export type EvaluationTargetItem = {
	userId: string;
	name: string;
	nim: string;
	subtitle: string;
	submission: {
		commitment: number;
		teamwork: number;
		attitude: number;
		contribution: number;
	} | null;
};

const PAGE_SIZE = 10;

export function TargetEvaluationList({
	idPrefix,
	targets,
	canSubmit,
	isPending,
	drafts,
	onDraftChange,
	onSubmit,
	submitLabel,
	commentPlaceholder,
	emptyMessage,
}: {
	idPrefix: string;
	targets: EvaluationTargetItem[];
	canSubmit: boolean;
	isPending: boolean;
	drafts: Record<string, IndicatorDraft>;
	onDraftChange: (userId: string, next: IndicatorDraft) => void;
	onSubmit: (userId: string, draft: IndicatorDraft) => void;
	submitLabel: string;
	commentPlaceholder: string;
	emptyMessage: string;
}) {
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "DONE">(
		"ALL",
	);
	const [page, setPage] = useState(1);

	const doneCount = targets.filter((t) => Boolean(t.submission)).length;
	const pendingCount = targets.length - doneCount;

	const needle = search.trim().toLowerCase();
	const filtered = targets.filter((target) => {
		if (statusFilter === "PENDING" && target.submission) return false;
		if (statusFilter === "DONE" && !target.submission) return false;
		if (!needle) return true;
		return (
			target.name.toLowerCase().includes(needle) ||
			target.nim.toLowerCase().includes(needle) ||
			target.subtitle.toLowerCase().includes(needle)
		);
	});

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const visible = filtered.slice(
		(safePage - 1) * PAGE_SIZE,
		safePage * PAGE_SIZE,
	);

	if (targets.length === 0) {
		return (
			<p role="status" className="text-muted-foreground text-sm">
				{emptyMessage}
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{targets.length > 5 && (
				<div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0 flex-1 sm:max-w-xs">
						<Input
							aria-label="Cari nama atau NIM rekan SR"
							type="search"
							className="min-h-11"
							placeholder="Cari nama, NIM, atau departemen…"
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
							}}
						/>
					</div>
					<Tabs
						value={statusFilter}
						onValueChange={(next) => {
							setStatusFilter(next as "ALL" | "PENDING" | "DONE");
							setPage(1);
						}}
					>
						<TabsList aria-label="Filter status penilaian rekan">
							<TabsTrigger value="ALL">Semua ({targets.length})</TabsTrigger>
							<TabsTrigger value="PENDING">
								Belum dinilai ({pendingCount})
							</TabsTrigger>
							<TabsTrigger value="DONE">Sudah ({doneCount})</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
			)}

			{visible.length === 0 ? (
				<p
					role="status"
					className="py-4 text-center text-muted-foreground text-sm"
				>
					Tidak ada rekan SR yang cocok dengan filter saat ini.
				</p>
			) : (
				<div className="divide-y divide-border rounded-xl border border-border bg-surface">
					{visible.map((target) => {
						const draft = drafts[target.userId] ?? DEFAULT_INDICATOR_DRAFT;
						return (
							<div key={target.userId} className="space-y-3 p-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate font-semibold text-foreground text-sm">
											{target.name}{" "}
											<span className="font-normal text-muted-foreground tabular-nums">
												· {target.nim}
											</span>
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{target.subtitle}
										</p>
									</div>
									{target.submission && (
										<span
											className={`shrink-0 rounded-full border px-2.5 py-1 font-bold text-xs ${penilaianStatusBadgeClass("APPROVED")}`}
										>
											Sudah Dinilai
										</span>
									)}
								</div>

								{target.submission ? (
									<p className="text-muted-foreground text-xs tabular-nums">
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
												const id = `${idPrefix}-${target.userId}-${field.key}`;
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
															disabled={!canSubmit || isPending}
															className="min-h-11 tabular-nums"
															value={draft[field.key]}
															onChange={(event) => {
																const parsed = Number(event.target.value);
																onDraftChange(target.userId, {
																	...draft,
																	[field.key]: Number.isFinite(parsed)
																		? Math.min(
																				100,
																				Math.max(0, Math.round(parsed)),
																			)
																		: 0,
																});
															}}
														/>
													</div>
												);
											})}
										</div>
										<Textarea
											aria-label={`Catatan untuk ${target.name}`}
											placeholder={commentPlaceholder}
											disabled={!canSubmit || isPending}
											value={draft.comment}
											onChange={(event) =>
												onDraftChange(target.userId, {
													...draft,
													comment: event.target.value,
												})
											}
										/>
										<Button
											type="button"
											className="min-h-11"
											disabled={!canSubmit || isPending}
											onClick={() => onSubmit(target.userId, draft)}
										>
											{submitLabel}
										</Button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{totalPages > 1 && (
				<div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
					<p className="text-muted-foreground tabular-nums">
						Halaman {safePage} dari {totalPages} · {filtered.length} rekan SR
					</p>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="min-h-10"
							disabled={safePage <= 1}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
						>
							Sebelumnya
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="min-h-10"
							disabled={safePage >= totalPages}
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						>
							Berikutnya
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
