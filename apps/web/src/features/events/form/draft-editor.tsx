"use client";

import { Input } from "@resora/ui/components/input";

import { Textarea } from "@resora/ui/components/textarea";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { attendanceQueryKeys, queryClient } from "@/utils/trpc";
import {
	eventErrorMessage,
	parseWibDateTimeInput,
	toWibDateTimeInput,
} from "../../../components/event-feedback";
import { refreshAttendanceQueries } from "../../../utils/internal-event-queries";

import {
	type DraftEditorProps,
	fieldClass,
	timeRangeMessage,
	useDraftEditor,
} from "./form-model";
import { RosterFields } from "./roster-fields";
import { ScheduleFields } from "./schedule-fields";
import { SessionFields } from "./session-fields";
export function DraftEditor(props: DraftEditorProps) {
	const view = useDraftEditor(props);
	if (!view) return null;
	const {
		initial,
		advancedMode,
		eventId,
		draft,
		setDraft,
		committeeMode,
		frozenCommittee,
		committee,
		submitLock,
		start,
		end,
		error,
		setError,
		reason,
		setReason,
		fullEditing,
		editorTitle,
		endError,
		setEndError,
		saving,
		setSaving,
		formRef,
		errorRef,
		invalidFieldId,
		setInvalidFieldId,
		router,
		create,
		edit,
		advanced,
		invitedCount,
	} = view;
	return (
		<section className="resora-page min-w-0 space-y-6">
			<nav aria-label="Breadcrumb event" className="text-sm">
				<ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<li>
						<Link
							className="focus-ring rounded-md text-muted-foreground hover:text-primary"
							href="/events?view=manage"
						>
							Kelola event
						</Link>
					</li>
					<li aria-hidden="true" className="text-muted-foreground">
						/
					</li>
					<li className="min-w-0">
						<span aria-current="page" className="block truncate font-medium">
							{editorTitle}
						</span>
					</li>
				</ol>
			</nav>
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">{editorTitle}</h1>
				<p className="text-muted-foreground text-sm">
					{advancedMode
						? "Perubahan administratif memerlukan alasan dan dicatat dalam audit. Field yang tersedia mengikuti status event dan kehadiran terkini."
						: "Siapkan informasi event dan undangan. Peserta dapat ditinjau setelah draft disimpan."}
				</p>
			</div>
			<form
				ref={formRef}
				aria-busy={saving}
				className="resora-event-form space-y-5"
				onSubmitCapture={() => setInvalidFieldId("")}
				onChangeCapture={(event) => {
					if (invalidFieldId && event.target.id === invalidFieldId) {
						setInvalidFieldId("");
						setError("");
					}
				}}
				onInvalidCapture={(event) => {
					event.preventDefault();
					setEndError("");
					const field = formRef.current?.querySelector<
						HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
					>("input:invalid, textarea:invalid, select:invalid");
					const details = field?.closest("details");
					if (details) details.open = true;
					setInvalidFieldId(field?.id ?? "");
					setError(field?.validationMessage || "Periksa kembali isian form.");
				}}
				onSubmit={async (event) => {
					event.preventDefault();
					if (submitLock.current) return;
					setError("");
					setEndError("");
					if (advancedMode && !reason.trim()) {
						setError("Alasan perubahan administratif wajib diisi.");
						return;
					}
					if (
						committeeMode &&
						!frozenCommittee &&
						(!draft.committeeId || !committee.data || committee.isError)
					) {
						setError(
							"Pilih kepanitiaan dan tunggu daftar anggota berhasil dimuat.",
						);
						return;
					}
					const startDate =
						advancedMode && start === toWibDateTimeInput(initial.startsAt)
							? new Date(initial.startsAt)
							: parseWibDateTimeInput(start);
					const endDate =
						advancedMode && end === toWibDateTimeInput(initial.endsAt)
							? new Date(initial.endsAt)
							: parseWibDateTimeInput(end);
					if (
						!Number.isFinite(startDate.getTime()) ||
						!Number.isFinite(endDate.getTime())
					) {
						setEndError("Isi waktu mulai dan selesai yang valid.");
						return;
					}
					if (endDate <= startDate) {
						setEndError(timeRangeMessage);
						return;
					}
					submitLock.current = true;
					setSaving(true);
					let saved = false;
					try {
						const input = {
							...draft,
							startsAt: startDate.toISOString(),
							endsAt: endDate.toISOString(),
						};
						const id = eventId ?? (await create.mutateAsync(input)).eventId;
						if (eventId && advancedMode) {
							if (advancedMode === "FULL")
								await advanced.mutateAsync({
									eventId,
									mode: "FULL",
									draft: input,
									reason,
								});
							else
								await advanced.mutateAsync({
									eventId,
									mode: "LIMITED",
									title: draft.title,
									description: draft.description ?? "",
									reason,
									...(advancedMode === "LIMITED" &&
									end !== toWibDateTimeInput(initial.endsAt)
										? { endsAt: input.endsAt }
										: {}),
								});
						} else if (eventId)
							await edit.mutateAsync({ eventId, draft: input });
						saved = true;
						await refreshAttendanceQueries(
							queryClient,
							attendanceQueryKeys,
						).catch(() => {});
						router.push(`/events/${id}`);
					} catch (cause) {
						if (
							cause instanceof Error &&
							cause.message.includes("Event end must follow start")
						)
							setEndError(timeRangeMessage);
						else setError(eventErrorMessage(cause));
					} finally {
						if (!saved) {
							submitLock.current = false;
							setSaving(false);
						}
					}
				}}
			>
				{(error || endError) && (
					<div
						ref={errorRef}
						id="event-form-error"
						tabIndex={-1}
						role="alert"
						className="focus-ring scroll-mt-24 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm outline-none"
					>
						<p className="flex items-center gap-2 font-semibold">
							<AlertCircle className="size-4 shrink-0" aria-hidden="true" />
							Periksa form sebelum menyimpan
						</p>
						<p className="mt-2">{error || endError}</p>
						{(endError || invalidFieldId) && (
							<a
								className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
								href={`#${endError ? "event-end" : invalidFieldId}`}
								onClick={(event) => {
									event.preventDefault();
									const field = document.getElementById(
										endError ? "event-end" : invalidFieldId,
									);
									const details = field?.closest("details");
									if (details) details.open = true;
									field?.focus();
									field?.scrollIntoView({ block: "center" });
								}}
							>
								Perbaiki isian
							</a>
						)}
					</div>
				)}
				<fieldset disabled={saving} className="min-w-0 space-y-5">
					<legend className="sr-only">Informasi dan pengaturan event</legend>
					<Card>
						<div className="border-border border-b p-5">
							<h2 className="font-semibold text-base">Informasi event</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								Judul dan deskripsi yang akan dilihat peserta.
							</p>
						</div>
						<CardContent className="grid min-w-0 grid-cols-1 gap-5">
							<label
								htmlFor="event-title"
								className="block min-w-0 font-medium text-sm"
							>
								Judul event{" "}
								<span className="text-muted-foreground text-xs">(wajib)</span>
								<Input
									id="event-title"
									aria-invalid={invalidFieldId === "event-title" || undefined}
									aria-describedby={
										invalidFieldId === "event-title"
											? "event-form-error"
											: undefined
									}
									placeholder="Contoh: Rapat koordinasi bulanan"
									required
									maxLength={200}
									className={fieldClass}
									value={draft.title}
									onChange={(e) =>
										setDraft({ ...draft, title: e.target.value })
									}
								/>
							</label>
							<label
								htmlFor="event-description"
								className="block min-w-0 font-medium text-sm"
							>
								Deskripsi{" "}
								<span className="text-muted-foreground text-xs">
									(opsional)
								</span>
								<Textarea
									id="event-description"
									aria-invalid={
										invalidFieldId === "event-description" || undefined
									}
									className={fieldClass}
									maxLength={5000}
									value={draft.description}
									onChange={(e) =>
										setDraft({ ...draft, description: e.target.value })
									}
								/>
							</label>
						</CardContent>
					</Card>
					{advancedMode !== "METADATA" && <ScheduleFields view={view} />}
					{fullEditing && (
						<>
							<SessionFields view={view} />
							<RosterFields view={view} />
						</>
					)}
					{advancedMode && (
						<label htmlFor="form-field-3" className="block space-y-2 text-sm">
							Alasan perubahan administratif
							<Textarea
								id="form-field-3"
								required
								maxLength={2000}
								className={fieldClass}
								value={reason}
								disabled={saving}
								onChange={(e) => setReason(e.target.value)}
							/>
						</label>
					)}
				</fieldset>
				<div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-md sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
					<div className="min-w-0 text-sm">
						<p className="font-semibold">
							{fullEditing
								? `${invitedCount} ${advancedMode ? "calon peserta" : "peserta dipilih"}`
								: "Perubahan event"}
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{advancedMode
								? "Perubahan dicatat dalam audit."
								: "Disimpan sebagai draft. Belum dipublikasikan."}
						</p>
					</div>
					<Button
						type="submit"
						className="w-full sm:w-auto"
						disabled={saving}
						loading={saving}
					>
						{saving
							? "Menyimpan perubahan…"
							: advancedMode
								? "Simpan perubahan"
								: eventId
									? "Simpan perubahan draft"
									: "Simpan draft"}
					</Button>
				</div>
			</form>
		</section>
	);
}
