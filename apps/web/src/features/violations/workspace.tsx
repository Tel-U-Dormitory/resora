"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";
import {
	ChevronLeft,
	ChevronRight,
	Plus,
	RotateCcw,
	SlidersHorizontal,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	buildings,
	currentActor,
	fixtures,
	formatTime,
	periods,
} from "./model";
import { type Draft, ReportForm } from "./report-form";

const views = ["Laporan aktif", "Riwayat penghapusan"] as const;
type View = (typeof views)[number];
type Panel =
	| { kind: "create" }
	| { kind: "detail" | "edit" | "delete"; code: string };

function Modal({
	title,
	description,
	close,
	children,
}: {
	title: string;
	description: string;
	close: () => void;
	children: ReactNode;
}) {
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl p-5 sm:max-w-lg sm:p-6">
				<div className="space-y-1">
					<DialogTitle className="font-bold text-xl tracking-tight">
						{title}
					</DialogTitle>
					<DialogDescription className="text-muted-foreground text-sm">
						{description}
					</DialogDescription>
				</div>
				<div className="mt-4">{children}</div>
				<div className="mt-5 flex justify-end border-border border-t pt-4">
					<Button
						variant="outline"
						className="min-h-11 w-full rounded-xl sm:w-auto"
						onClick={close}
					>
						Tutup
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function KtmPreview({ image }: { image: Blob }) {
	const [url, setUrl] = useState("");
	useEffect(() => {
		const address = URL.createObjectURL(image);
		setUrl(address);
		return () => URL.revokeObjectURL(address);
	}, [image]);
	// Blob URLs only exist in this browser session.
	return url ? (
		// biome-ignore lint/performance/noImgElement: Local blob preview needs no server optimization.
		<img
			src={url}
			alt="Foto KTM simulasi"
			className="max-h-64 max-w-full rounded-xl border border-border object-contain"
		/>
	) : null;
}

export function ViolationsWorkspace({ fixedAdmin }: { fixedAdmin?: boolean }) {
	const [reports, setReports] = useState(fixtures);
	const [demoAdmin, setAdmin] = useState(false);
	const admin = fixedAdmin ?? demoAdmin;
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [view, setView] = useState<View>(views[0]);
	const [panel, setPanel] = useState<Panel>();
	const [draft, setDraft] = useState<Draft>();
	const [notice, setNotice] = useState("");
	const [deleteError, setDeleteError] = useState("");
	const [query, setQuery] = useState("");
	const [building, setBuilding] = useState("");
	const [period, setPeriod] = useState("");
	const [from, setFrom] = useState("");
	const [until, setUntil] = useState("");
	const actor = admin ? "SUPERADMIN Simulasi" : currentActor;
	const selected =
		panel && "code" in panel
			? reports.find(({ code }) => code === panel.code)
			: undefined;
	const canChange =
		selected && !selected.deleted && (admin || selected.actor === actor);
	const invalidRange = Boolean(from && until && from > until);
	const activeFilterCount = [building, period, from, until].filter(
		Boolean,
	).length;
	const hasAnyFilter = Boolean(query.trim() || activeFilterCount);

	const matches = reports.filter(
		(report) =>
			!invalidRange &&
			(!building || building === report.building) &&
			(!period || period === report.period) &&
			(!from || report.date >= from) &&
			(!until || report.date <= until),
	);
	const active = matches.filter((report) => !report.deleted);
	const visible =
		view === views[1]
			? matches.filter(({ deleted }) => deleted)
			: active.filter(({ name, nim }) =>
					[name, nim].some((value) =>
						value
							.toLocaleLowerCase("id")
							.includes(query.trim().toLocaleLowerCase("id")),
					),
				);

	function resetFilters() {
		setQuery("");
		setBuilding("");
		setPeriod("");
		setFrom("");
		setUntil("");
	}

	function close() {
		setDraft(undefined);
		setPanel(undefined);
		setDeleteError("");
	}

	function create() {
		if (!draft?.image) return;
		const code = `PLG-DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
		const created = new Date().toISOString();
		setReports((items) => [
			{
				...draft.fields,
				code,
				created,
				actor,
				building: draft.building,
				period: periods[0],
				image: draft.image,
				corrections: [],
			},
			...items,
		]);
		setView(views[0]);
		resetFilters();
		setNotice(`Laporan simulasi ${code} dicatat pada ${formatTime(created)}.`);
		close();
	}

	function edit(next: Draft) {
		if (!selected || !canChange) return;
		const { name, nim, date, description } = selected;
		const correction = {
			actor,
			at: new Date().toISOString(),
			reason: next.reason,
			before: { name, nim, date, description },
			after: next.fields,
			imageChanged: Boolean(next.image),
		};
		setReports((items) =>
			items.map((item) =>
				item.code === selected.code
					? {
							...item,
							...next.fields,
							image: next.image ?? item.image,
							corrections: [...item.corrections, correction],
						}
					: item,
			),
		);
		setNotice(`Perubahan laporan ${selected.code} disimpan di simulasi.`);
		close();
	}

	function remove(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selected || !canChange) return;
		const reason = String(
			new FormData(event.currentTarget).get("reason") ?? "",
		).trim();
		if (!reason) {
			setDeleteError("Isi alasan penghapusan.");
			return;
		}
		setReports((items) =>
			items.map((item) =>
				item.code === selected.code
					? {
							...item,
							deleted: { reason, actor, at: new Date().toISOString() },
						}
					: item,
			),
		);
		setView(views[1]);
		setNotice(
			`Laporan ${selected.code} dipindahkan ke riwayat penghapusan simulasi.`,
		);
		close();
	}

	return (
		<section className="resora-page space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1.5">
					<h1 className="font-bold text-2xl tracking-tight">
						Pencatatan pelanggaran
					</h1>
					<p className="hidden text-muted-foreground text-sm sm:block">
						Catat kejadian dan telusuri laporan lintas gedung.
					</p>
				</div>
				<Button
					size="lg"
					className="min-h-11 w-full rounded-xl sm:w-auto"
					leftIcon={<Plus size={18} aria-hidden="true" />}
					onClick={() => {
						setNotice("");
						setPanel({ kind: "create" });
					}}
				>
					Buat laporan
				</Button>
			</div>

			<Card className="rounded-2xl border-border bg-surface shadow-none">
				<CardContent className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
					<div className="flex flex-wrap items-center gap-2.5">
						<span className="inline-flex items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 font-semibold text-amber-800 text-xs dark:text-amber-300">
							Preview sintetis
						</span>
						<p className="text-muted-foreground text-sm">
							Data contoh simulasi frontend. Perubahan hilang saat halaman
							dimuat ulang.
						</p>
					</div>
					{fixedAdmin === undefined && (
						<div className="w-full space-y-1 sm:w-52 sm:shrink-0">
							<Label htmlFor="violation-demo-role" className="text-xs">
								Peran simulasi
							</Label>
							<Select
								id="violation-demo-role"
								value={admin ? "admin" : "sr"}
								onChange={(event) => {
									close();
									setAdmin(event.target.value === "admin");
									setNotice("");
								}}
							>
								<option value="sr">Senior Resident</option>
								<option value="admin">SUPERADMIN</option>
							</Select>
						</div>
					)}
				</CardContent>
			</Card>

			{notice && (
				<p
					role="status"
					className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 font-medium text-emerald-800 text-sm dark:text-emerald-300"
				>
					{notice}
				</p>
			)}

			<Tabs
				value={view}
				onValueChange={(next) => setView(next as View)}
				className="w-full sm:w-auto"
			>
				<TabsList
					aria-label="Tampilan pelanggaran"
					className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto"
				>
					{views.map((item) => (
						<TabsTrigger key={item} value={item} className="w-full sm:w-auto">
							{item}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<Card className="rounded-2xl border-border bg-surface shadow-none">
				<CardContent className="grid gap-3.5 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-4">
					{view === views[0] && (
						<div className="space-y-1.5">
							<Label htmlFor="violations-search">Cari nama atau NIM</Label>
							<Input
								id="violations-search"
								type="search"
								placeholder="Ketik nama mahasiswa atau NIM…"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
					)}
					<div className="flex flex-wrap items-center gap-2 sm:col-start-2 sm:justify-end">
						<Button
							variant="outline"
							className="min-h-11 flex-1 rounded-xl sm:flex-initial"
							leftIcon={<SlidersHorizontal size={16} aria-hidden="true" />}
							aria-expanded={filtersOpen}
							aria-controls="violations-filters"
							onClick={() => setFiltersOpen(!filtersOpen)}
						>
							{filtersOpen ? "Tutup filter" : "Filter laporan"}
							{activeFilterCount ? ` (${activeFilterCount})` : ""}
						</Button>
						{hasAnyFilter && (
							<Button
								variant="ghost"
								className="min-h-11 rounded-xl"
								leftIcon={<RotateCcw size={15} aria-hidden="true" />}
								onClick={resetFilters}
							>
								Reset
							</Button>
						)}
					</div>
					<div
						id="violations-filters"
						hidden={!filtersOpen}
						className="col-span-full grid gap-3.5 border-border border-t pt-3.5 sm:grid-cols-2 xl:grid-cols-4"
						style={filtersOpen ? undefined : { display: "none" }}
					>
						<div className="space-y-1.5">
							<Label htmlFor="filter-building">Gedung pencatat</Label>
							<Select
								id="filter-building"
								value={building}
								onChange={(event) => setBuilding(event.target.value)}
							>
								<option value="">Semua gedung</option>
								{buildings.map((item) => (
									<option key={item}>{item}</option>
								))}
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="filter-period">Periode SR</Label>
							<Select
								id="filter-period"
								value={period}
								onChange={(event) => setPeriod(event.target.value)}
							>
								<option value="">Semua periode</option>
								{periods.map((item) => (
									<option key={item}>{item}</option>
								))}
							</Select>
						</div>
						<div className="min-w-0 space-y-1.5">
							<Label htmlFor="filter-from">Dari tanggal</Label>
							<Input
								id="filter-from"
								type="date"
								value={from}
								onChange={(event) => setFrom(event.target.value)}
							/>
						</div>
						<div className="min-w-0 space-y-1.5">
							<Label htmlFor="filter-until">Sampai tanggal</Label>
							<Input
								id="filter-until"
								type="date"
								value={until}
								aria-invalid={invalidRange}
								aria-describedby={
									invalidRange ? "violations-range-error" : undefined
								}
								onChange={(event) => setUntil(event.target.value)}
							/>
						</div>
						{invalidRange && (
							<p
								id="violations-range-error"
								role="alert"
								className="col-span-full rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 font-medium text-danger text-sm"
							>
								Tanggal akhir harus sama dengan atau setelah tanggal awal.
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			<section aria-labelledby="violations-results" className="space-y-3.5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2
						id="violations-results"
						className="font-bold text-lg tracking-tight"
					>
						{view}
					</h2>
					<span className="text-muted-foreground text-sm tabular-nums">
						{visible.length} laporan
					</span>
				</div>

				{visible.length ? (
					<ul className="grid gap-3">
						{visible.map((report) => (
							<li key={report.code}>
								<Card className="rounded-2xl border-border bg-surface shadow-none transition-colors hover:border-border-control">
									<CardContent className="flex flex-col gap-3.5 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
										<div className="min-w-0 space-y-1.5">
											<div className="flex flex-wrap items-center gap-2">
												<span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-muted-foreground text-xs">
													{report.code}
												</span>
												<span className="inline-flex items-center rounded-full border border-border bg-surface-subtle px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
													{report.building}
												</span>
												<span className="inline-flex items-center rounded-full border border-border bg-surface-subtle px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
													{report.period}
												</span>
												{report.deleted && (
													<span className="inline-flex items-center rounded-full bg-danger/10 px-2.5 py-0.5 font-semibold text-danger text-xs">
														Dihapus
													</span>
												)}
											</div>
											{report.deleted ? (
												<>
													<p className="font-medium text-foreground text-sm leading-relaxed">
														Laporan {report.code} dihapus oleh{" "}
														<strong className="font-semibold">
															{report.deleted.actor}
														</strong>{" "}
														karena {report.deleted.reason}
													</p>
													<p className="text-muted-foreground text-xs">
														{formatTime(report.deleted.at)}
													</p>
												</>
											) : (
												<>
													<h3 className="font-bold text-base text-foreground leading-snug">
														{report.name}{" "}
														<span className="font-medium text-muted-foreground text-sm tabular-nums">
															· {report.nim}
														</span>
													</h3>
													<p className="text-muted-foreground text-sm">
														{report.date} · Pencatat: {report.actor}
													</p>
												</>
											)}
										</div>
										{(!report.deleted || admin) && (
											<Button
												variant="outline"
												className="min-h-11 w-full shrink-0 rounded-xl sm:w-auto"
												rightIcon={
													<ChevronRight size={16} aria-hidden="true" />
												}
												aria-label={`Lihat detail ${report.code}`}
												onClick={() =>
													setPanel({ kind: "detail", code: report.code })
												}
											>
												Lihat detail
											</Button>
										)}
									</CardContent>
								</Card>
							</li>
						))}
					</ul>
				) : (
					<EmptyState
						variant={view === views[1] ? "history" : "folder"}
						title="Tidak ada laporan yang cocok"
						description={
							hasAnyFilter
								? "Ubah kata kunci pencarian atau reset filter untuk melihat laporan lain."
								: "Belum ada data laporan pada tampilan ini."
						}
						action={
							hasAnyFilter ? (
								<Button
									variant="outline"
									className="min-h-11 rounded-xl"
									leftIcon={<RotateCcw size={16} aria-hidden="true" />}
									onClick={resetFilters}
								>
									Reset filter
								</Button>
							) : view === views[0] ? (
								<Button
									className="min-h-11 rounded-xl"
									leftIcon={<Plus size={16} aria-hidden="true" />}
									onClick={() => {
										setNotice("");
										setPanel({ kind: "create" });
									}}
								>
									Buat laporan
								</Button>
							) : undefined
						}
					/>
				)}
			</section>

			{panel?.kind === "create" && (
				<Modal
					title="Buat laporan"
					description="Masukkan identitas mahasiswa dan catatan kejadian."
					close={close}
				>
					<div hidden={Boolean(draft)}>
						<ReportForm admin={admin} onContinue={setDraft} />
					</div>
					{draft && (
						<div className="space-y-4">
							<p
								tabIndex={-1}
								ref={(node) => node?.focus()}
								className="rounded-xl border border-border bg-surface-subtle/60 p-3.5 font-medium text-foreground text-sm"
							>
								Apakah pelanggar adalah penghuni{" "}
								<strong className="font-bold">{draft.building}</strong>?
							</p>
							<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
								<Button
									className="min-h-11 rounded-xl"
									variant="outline"
									onClick={() => setDraft(undefined)}
								>
									Tidak, kembali ke form
								</Button>
								<Button className="min-h-11 rounded-xl" onClick={create}>
									Ya, simpan laporan
								</Button>
							</div>
						</div>
					)}
				</Modal>
			)}

			{panel?.kind === "edit" && canChange && (
				<Modal title="Edit laporan" description={selected.code} close={close}>
					<ReportForm
						key={selected.code}
						report={selected}
						admin={admin}
						onContinue={edit}
					/>
				</Modal>
			)}

			{panel?.kind === "delete" && canChange && (
				<Modal
					title="Hapus laporan?"
					description={`Laporan ${selected.code} akan dipindahkan ke riwayat penghapusan.`}
					close={close}
				>
					<form className="grid gap-3.5" onSubmit={remove}>
						<div className="space-y-1.5">
							<Label htmlFor="delete-reason">Alasan penghapusan</Label>
							<Textarea
								id="delete-reason"
								name="reason"
								rows={3}
								required
								maxLength={500}
							/>
						</div>
						{deleteError && (
							<p
								role="alert"
								className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 font-medium text-danger text-sm"
							>
								{deleteError}
							</p>
						)}
						<Button
							type="submit"
							variant="danger"
							className="min-h-11 w-full rounded-xl sm:w-auto sm:justify-self-start"
						>
							Hapus laporan simulasi
						</Button>
					</form>
				</Modal>
			)}

			{panel?.kind === "detail" && selected && (!selected.deleted || admin) && (
				<Modal title="Detail laporan" description={selected.code} close={close}>
					<dl className="grid gap-3 rounded-xl border border-border bg-surface-subtle/60 p-3.5 text-sm sm:grid-cols-2">
						{Object.entries({
							Mahasiswa: selected.name,
							NIM: selected.nim,
							"Tanggal kejadian": selected.date,
							"Gedung pencatat": selected.building,
							"Periode SR": selected.period,
							Pencatat: selected.actor,
							"Dicatat pada": formatTime(selected.created),
							Keterangan: selected.description,
						}).map(([label, value]) => (
							<div
								key={label}
								className={label === "Keterangan" ? "sm:col-span-2" : undefined}
							>
								<dt className="text-muted-foreground text-xs">{label}</dt>
								<dd className="mt-0.5 whitespace-pre-wrap font-medium text-foreground">
									{value}
								</dd>
							</div>
						))}
					</dl>

					<div className="mt-4">
						{selected.image ? (
							<KtmPreview image={selected.image} />
						) : (
							<p className="rounded-xl border border-border border-dashed px-3.5 py-3 text-muted-foreground text-sm">
								Foto KTM tidak tersedia pada laporan contoh ini.
							</p>
						)}
					</div>

					{selected.deleted && (
						<p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-danger text-sm">
							Dihapus oleh{" "}
							<strong className="font-semibold">
								{selected.deleted.actor}
							</strong>{" "}
							pada {formatTime(selected.deleted.at)}. Alasan:{" "}
							{selected.deleted.reason}
						</p>
					)}

					{(admin || selected.actor === actor) && (
						<section className="mt-4">
							{selected.corrections.length ? (
								<details className="group rounded-xl border border-border bg-surface-subtle/40 p-3.5">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-sm">
										<span>Riwayat koreksi ({selected.corrections.length})</span>
										<ChevronLeft
											size={18}
											aria-hidden="true"
											className="shrink-0 text-primary transition-transform duration-200 group-open:-rotate-90"
										/>
									</summary>
									<ul className="mt-3 space-y-2 border-border border-t pt-3">
										{selected.corrections.map((change, index) => (
											<li
												className="break-words rounded-xl bg-muted p-3 text-sm"
												key={`${change.at}-${index}`}
											>
												<p className="font-semibold">
													{change.actor} · {formatTime(change.at)}
												</p>
												<p className="mt-0.5">{change.reason}</p>
												{(["name", "nim", "date", "description"] as const).map(
													(key, position) =>
														change.before[key] !== change.after[key] && (
															<p
																key={key}
																className="mt-1 text-muted-foreground text-xs"
															>
																{
																	["Nama", "NIM", "Tanggal", "Keterangan"][
																		position
																	]
																}
																: {change.before[key]} → {change.after[key]}
															</p>
														),
												)}
												{change.imageChanged && (
													<p className="mt-1 text-muted-foreground text-xs">
														Foto KTM diganti.
													</p>
												)}
											</li>
										))}
									</ul>
								</details>
							) : (
								<div className="rounded-xl border border-border bg-surface-subtle/40 px-3.5 py-2.5 text-muted-foreground text-sm">
									Riwayat koreksi: Belum ada koreksi.
								</div>
							)}
						</section>
					)}

					{canChange && (
						<div className="mt-5 grid grid-cols-2 gap-2.5">
							<Button
								className="min-h-11 rounded-xl"
								variant="outline"
								onClick={() => setPanel({ kind: "edit", code: selected.code })}
							>
								Edit laporan
							</Button>
							<Button
								className="min-h-11 rounded-xl"
								variant="danger"
								onClick={() =>
									setPanel({ kind: "delete", code: selected.code })
								}
							>
								Hapus laporan
							</Button>
						</div>
					)}
				</Modal>
			)}
		</section>
	);
}
