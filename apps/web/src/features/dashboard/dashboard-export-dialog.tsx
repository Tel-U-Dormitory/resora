"use client";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { useEffect, useRef, useState } from "react";
import type { DashboardFixture, DashboardMetric } from "./dashboard.contracts";
import { useDashboardPreview } from "./dashboard-preview-context";

export function DashboardExportDialog({
	metric,
	fixture,
	open,
	onOpenChange,
}: {
	metric: DashboardMetric;
	fixture: DashboardFixture;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { scenarios } = useDashboardPreview();
	const formats =
		metric.export?.formats.filter(
			(format): format is "xlsx" | "pdf" =>
				format === "xlsx" || format === "pdf",
		) ?? [];
	const [format, setFormat] = useState<"xlsx" | "pdf">(formats[0] ?? "xlsx");
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<{
		kind: "status" | "alert";
		text: string;
	} | null>(null);
	const active = useRef<AbortController | null>(null);
	useEffect(() => () => active.current?.abort(), []);
	const changeOpen = (next: boolean) => {
		if (!next) {
			active.current?.abort();
			active.current = null;
			setPending(false);
			setMessage(null);
		}
		onOpenChange(next);
	};
	const download = async () => {
		if (
			active.current ||
			!metric.period.startsAt ||
			!metric.period.endsAt ||
			!metric.export ||
			!formats.includes(format)
		)
			return;
		const controller = new AbortController();
		active.current = controller;
		setPending(true);
		setMessage(null);
		try {
			const { requestDashboardExport, decodePreviewFile } = await import(
				"./dashboard-preview-export"
			);
			const file = await requestDashboardExport(
				fixture,
				{
					report: metric.export.report,
					format,
					scope: metric.scope,
					period: {
						...metric.period,
						startsAt: metric.period.startsAt,
						endsAt: metric.period.endsAt,
					},
				},
				scenarios.export,
				controller.signal,
			);
			controller.signal.throwIfAborted();
			const url = URL.createObjectURL(
				new Blob([decodePreviewFile(file.base64)], { type: file.mimeType }),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = file.fileName;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			setMessage({
				kind: "status",
				text: `Unduhan contoh ${format.toUpperCase()} dimulai (${file.rowCount} baris ringkasan). Ini data sintetis; tidak ada audit atau laporan operasional yang dibuat.`,
			});
		} catch (error) {
			if (!controller.signal.aborted)
				setMessage({
					kind: "alert",
					text:
						error instanceof Error
							? error.message
							: "Contoh laporan gagal dimuat. Coba kembali.",
				});
		} finally {
			if (active.current === controller) {
				active.current = null;
				setPending(false);
			}
		}
	};
	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogContent>
				<div className="space-y-5">
					<div className="space-y-2">
						<DialogTitle className="font-semibold text-xl">
							Ekspor contoh {metric.title.toLowerCase()}
						</DialogTitle>
						<DialogDescription className="text-muted-foreground text-sm">
							Unduh file sintetis untuk meninjau format. File ini bukan laporan
							operasional dan tidak berisi data anggota nyata.
						</DialogDescription>
					</div>
					<dl className="space-y-3 text-sm">
						<div>
							<dt className="text-muted-foreground">Jenis laporan</dt>
							<dd>Ringkasan {metric.title.toLowerCase()}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Cakupan</dt>
							<dd>
								{metric.scope === "organization"
									? "Seluruh departemen"
									: metric.scope === "department"
										? "Departemen"
										: "Pribadi"}
							</dd>
						</div>
					</dl>
					<label className="grid gap-2 text-sm">
						Periode laporan
						<select
							className="min-h-11 w-full rounded-xl border border-border bg-surface px-3"
							disabled={pending}
							value={metric.period.label}
							onChange={() => {}}
						>
							<option>{metric.period.label}</option>
						</select>
					</label>
					<p className="text-muted-foreground text-sm">
						Preview hanya menyediakan periode dan cakupan yang tercantum. Filter
						departemen serta field sensitif menunggu kontrak modul sumber.
					</p>
					<label className="grid gap-2 text-sm">
						Format file
						<select
							className="min-h-11 w-full rounded-xl border border-border bg-surface px-3"
							value={format}
							disabled={pending}
							onChange={(event) =>
								setFormat(event.target.value as "xlsx" | "pdf")
							}
						>
							{formats.map((item) => (
								<option key={item} value={item}>
									{item === "xlsx" ? "Excel (.xlsx)" : "PDF (.pdf)"}
								</option>
							))}
						</select>
					</label>
					{message && (
						<p role={message.kind} className="text-sm">
							{message.text}
						</p>
					)}
					<div className="flex flex-wrap gap-3">
						<button
							type="button"
							className="focus-ring min-h-12 rounded-xl bg-primary px-4 font-semibold text-primary-foreground text-sm"
							disabled={pending || !formats.length}
							onClick={() => void download()}
						>
							{pending ? "Menyiapkan contoh…" : "Unduh contoh sintetis"}
						</button>
						<button
							type="button"
							className="focus-ring min-h-11 rounded-xl border border-border px-4 text-sm"
							onClick={() => changeOpen(false)}
						>
							{pending ? "Batalkan" : "Tutup"}
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
