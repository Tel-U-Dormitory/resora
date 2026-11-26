"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { ClipboardList, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	buildings,
	currentActor,
	fixtures,
	formatTime,
	periods,
} from "./model";
import { control, type Draft, ReportForm } from "./report-form";

const views = [
	"Laporan aktif",
	"Riwayat penghapusan",
	"Rekap pelanggaran",
] as const;
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
			<DialogContent>
				<DialogTitle className="font-semibold text-xl">{title}</DialogTitle>
				<DialogDescription className="mt-1 mb-5 text-muted-foreground text-sm">
					{description}
				</DialogDescription>
				{children}
				<Button variant="outline" className="mt-4 min-h-11" onClick={close}>
					Tutup
				</Button>
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
			className="max-h-64 max-w-full rounded-xl object-contain"
		/>
	) : null;
}

function Counts({
	title,
	entries,
}: {
	title: string;
	entries: [string, number][];
}) {
	const max = Math.max(1, ...entries.map(([, count]) => count));
	return (
		<section className="min-w-0">
			<h3 className="mb-3 font-semibold">{title}</h3>
			<ul className="space-y-3">
				{entries.map(([label, count]) => (
					<li key={label}>
						<div className="mb-1 flex justify-between gap-3 text-sm">
							<span>{label}</span>
							<strong>{count}</strong>
						</div>
						<div
							aria-hidden="true"
							className="h-2 overflow-hidden rounded-full bg-muted"
						>
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${(count / max) * 100}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

export function ViolationsWorkspace() {
	const [reports, setReports] = useState(fixtures);
	const [admin, setAdmin] = useState(false);
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
	const trend = [...new Set(active.map(({ date }) => date))]
		.sort()
		.map((date): [string, number] => [
			date,
			active.filter((report) => report.date === date).length,
		]);

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
		setQuery("");
		setBuilding("");
		setPeriod("");
		setFrom("");
		setUntil("");
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
		<div className="mx-auto grid w-full min-w-0 max-w-[90rem] gap-5 px-4 py-6 md:px-6 xl:px-8">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-bold text-2xl md:text-[1.75rem]">
						Pencatatan pelanggaran
					</h1>
					<p className="mt-1 text-muted-foreground">
						Catat kejadian dan telusuri laporan lintas gedung.
					</p>
				</div>
				<Button
					size="lg"
					leftIcon={<Plus size={20} />}
					onClick={() => {
						setNotice("");
						setPanel({ kind: "create" });
					}}
				>
					Buat laporan
				</Button>
			</header>
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
				<p className="max-w-prose text-muted-foreground text-sm">
					<strong className="text-foreground">Simulasi frontend.</strong>{" "}
					Gunakan data contoh. Perubahan hilang saat halaman dimuat ulang.
				</p>
				<label className="grid w-full gap-1 font-semibold text-sm sm:w-auto">
					Peran simulasi
					<select
						className={control}
						value={admin ? "admin" : "sr"}
						onChange={(event) => {
							close();
							setAdmin(event.target.value === "admin");
							setNotice("");
						}}
					>
						<option value="sr">Senior Resident</option>
						<option value="admin">SUPERADMIN</option>
					</select>
				</label>
			</div>
			{notice && (
				<p
					role="status"
					className="rounded-xl border border-border bg-muted p-3 text-sm"
				>
					{notice}
				</p>
			)}
			<fieldset
				aria-label="Tampilan pelanggaran"
				className="flex flex-wrap gap-2"
			>
				{views.map((item) => (
					<Button
						key={item}
						className="min-h-11"
						variant={view === item ? "primary" : "outline"}
						aria-pressed={view === item}
						onClick={() => setView(item)}
					>
						{item}
					</Button>
				))}
			</fieldset>
			<Card className="rounded-2xl shadow-none">
				<CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
					{view === views[0] && (
						<label className="grid gap-1 font-semibold text-sm">
							Cari nama atau NIM
							<input
								className={control}
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</label>
					)}
					<label className="grid gap-1 font-semibold text-sm">
						Gedung pencatat
						<select
							className={control}
							value={building}
							onChange={(event) => setBuilding(event.target.value)}
						>
							<option value="">Semua gedung</option>
							{buildings.map((item) => (
								<option key={item}>{item}</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 font-semibold text-sm">
						Periode SR
						<select
							className={control}
							value={period}
							onChange={(event) => setPeriod(event.target.value)}
						>
							<option value="">Semua periode</option>
							{periods.map((item) => (
								<option key={item}>{item}</option>
							))}
						</select>
					</label>
					<label className="grid min-w-0 gap-1 font-semibold text-sm">
						Dari tanggal
						<input
							className={control}
							type="date"
							value={from}
							onChange={(event) => setFrom(event.target.value)}
						/>
					</label>
					<label className="grid min-w-0 gap-1 font-semibold text-sm">
						Sampai tanggal
						<input
							className={control}
							type="date"
							value={until}
							aria-invalid={invalidRange}
							aria-describedby={
								invalidRange ? "violations-range-error" : undefined
							}
							onChange={(event) => setUntil(event.target.value)}
						/>
					</label>
					{invalidRange && (
						<p
							id="violations-range-error"
							role="alert"
							className="text-destructive text-sm sm:col-span-2 xl:col-span-5"
						>
							Tanggal akhir harus sama dengan atau setelah tanggal awal.
						</p>
					)}
				</CardContent>
			</Card>
			<section aria-labelledby="violations-results" className="grid gap-3">
				<h2 id="violations-results" className="font-semibold text-xl">
					{view}
				</h2>
				{view === views[2] ? (
					<Card className="rounded-2xl shadow-none">
						<CardContent className="grid gap-5">
							<p>
								<strong className="mr-2 text-3xl tabular-nums">
									{active.length}
								</strong>{" "}
								laporan aktif
							</p>
							{active.length ? (
								<div className="grid gap-6 md:grid-cols-2">
									<Counts
										title="Jumlah per gedung pencatat"
										entries={buildings.map((item) => [
											item,
											active.filter((report) => report.building === item)
												.length,
										])}
									/>
									<Counts
										title="Tren berdasarkan tanggal kejadian"
										entries={trend}
									/>
								</div>
							) : (
								<p className="text-muted-foreground">
									Tidak ada laporan aktif pada filter ini.
								</p>
							)}
							<Button
								variant="outline"
								className="min-h-11 justify-self-start"
								onClick={() => {
									setQuery("");
									setView(views[0]);
								}}
							>
								Lihat laporan aktif
							</Button>
						</CardContent>
					</Card>
				) : visible.length ? (
					<ul className="grid gap-3">
						{visible.map((report) => (
							<li key={report.code}>
								<Card className="rounded-2xl shadow-none">
									<CardContent className="flex flex-wrap items-center justify-between gap-3">
										<div className="min-w-0 space-y-1 break-words">
											<p className="text-muted-foreground text-sm">
												{report.code}
											</p>
											{report.deleted ? (
												<>
													<p>
														Laporan {report.code} dihapus oleh{" "}
														{report.deleted.actor} karena{" "}
														{report.deleted.reason}
													</p>
													<p className="text-muted-foreground text-sm">
														{formatTime(report.deleted.at)}
													</p>
												</>
											) : (
												<>
													<h3 className="font-semibold">
														{report.name}{" "}
														<span className="font-normal text-muted-foreground text-sm">
															· {report.nim}
														</span>
													</h3>
													<p className="text-muted-foreground text-sm">
														{report.building} · {report.date} · {report.actor}
													</p>
												</>
											)}
										</div>
										{(!report.deleted || admin) && (
											<Button
												variant="outline"
												className="min-h-11"
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
					<Card className="rounded-2xl shadow-none">
						<CardContent className="flex items-start gap-3">
							<ClipboardList aria-hidden size={22} />
							<div>
								<p className="font-semibold">Tidak ada laporan yang cocok</p>
								<p className="text-muted-foreground text-sm">
									Ubah pencarian atau filter untuk melihat hasil lain.
								</p>
							</div>
						</CardContent>
					</Card>
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
						<div className="grid gap-4">
							<p tabIndex={-1} ref={(node) => node?.focus()}>
								Apakah pelanggar adalah penghuni {draft.building}?
							</p>
							<div className="flex flex-wrap gap-2">
								<Button
									className="min-h-11"
									variant="outline"
									onClick={() => setDraft(undefined)}
								>
									Tidak, kembali ke form
								</Button>
								<Button className="min-h-11" onClick={create}>
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
					<form className="grid gap-3" onSubmit={remove}>
						<label className="grid gap-1 font-semibold text-sm">
							Alasan penghapusan
							<textarea
								className={control}
								name="reason"
								rows={3}
								required
								maxLength={500}
							/>
						</label>
						{deleteError && (
							<p role="alert" className="text-destructive text-sm">
								{deleteError}
							</p>
						)}
						<Button
							type="submit"
							variant="danger"
							className="min-h-11 justify-self-start"
						>
							Hapus laporan simulasi
						</Button>
					</form>
				</Modal>
			)}
			{panel?.kind === "detail" && selected && (!selected.deleted || admin) && (
				<Modal title="Detail laporan" description={selected.code} close={close}>
					<dl className="grid gap-3 break-words text-sm">
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
							<div key={label}>
								<dt className="font-semibold">{label}</dt>
								<dd className="whitespace-pre-wrap">{value}</dd>
							</div>
						))}
					</dl>
					<div className="mt-4">
						{selected.image ? (
							<KtmPreview image={selected.image} />
						) : (
							<p className="text-muted-foreground text-sm">
								Foto KTM tidak tersedia pada laporan contoh ini.
							</p>
						)}
					</div>
					{selected.deleted && (
						<p className="mt-4 break-words text-sm">
							Dihapus oleh {selected.deleted.actor} pada{" "}
							{formatTime(selected.deleted.at)}. Alasan:{" "}
							{selected.deleted.reason}
						</p>
					)}
					{(admin || selected.actor === actor) && (
						<section className="mt-5 space-y-2">
							<h3 className="font-semibold">Riwayat koreksi</h3>
							{selected.corrections.length ? (
								<ul className="space-y-2">
									{selected.corrections.map((change, index) => (
										<li
											className="break-words rounded-xl bg-muted p-3 text-sm"
											key={`${change.at}-${index}`}
										>
											<p className="font-semibold">
												{change.actor} · {formatTime(change.at)}
											</p>
											<p>{change.reason}</p>
											{(["name", "nim", "date", "description"] as const).map(
												(key, position) =>
													change.before[key] !== change.after[key] && (
														<p key={key}>
															{
																["Nama", "NIM", "Tanggal", "Keterangan"][
																	position
																]
															}
															: {change.before[key]} → {change.after[key]}
														</p>
													),
											)}
											{change.imageChanged && <p>Foto KTM diganti.</p>}
										</li>
									))}
								</ul>
							) : (
								<p className="text-muted-foreground text-sm">
									Belum ada koreksi.
								</p>
							)}
						</section>
					)}
					{canChange && (
						<div className="mt-5 flex flex-wrap gap-2">
							<Button
								className="min-h-11"
								variant="outline"
								onClick={() => setPanel({ kind: "edit", code: selected.code })}
							>
								Edit laporan
							</Button>
							<Button
								className="min-h-11"
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
		</div>
	);
}
