"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	buildings,
	compressKtm,
	emptyFields,
	type Fields,
	localDate,
	type Report,
} from "./model";

export const control =
	"focus-ring min-h-11 w-full min-w-0 rounded-xl border border-input bg-surface px-3 py-2 text-base";

export type Draft = {
	fields: Fields;
	building: string;
	image?: Blob;
	reason: string;
};

export function ReportForm({
	report,
	admin,
	onContinue,
}: {
	report?: Report;
	admin: boolean;
	onContinue: (draft: Draft) => void;
}) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending.current) return;
		const form = event.currentTarget;
		const data = new FormData(form);
		const value = (key: string) => String(data.get(key) ?? "").trim();
		const fields = {
			name: value("name"),
			nim: value("nim"),
			date: value("date"),
			description: value("description"),
		};
		const reason = value("reason");
		const building =
			report?.building ?? (admin ? value("building") : buildings[0]);
		const file = data.get("ktm");
		if (Object.values(fields).some((field) => !field) || (report && !reason)) {
			setError("Lengkapi semua kolom wajib.");
			return;
		}
		if (fields.date > localDate()) {
			setError("Tanggal kejadian tidak boleh melewati hari ini.");
			return;
		}
		pending.current = true;
		setBusy(true);
		setError("");
		try {
			const image =
				file instanceof File && file.name ? await compressKtm(file) : undefined;
			if (!report && !image) throw new Error("Pilih satu foto KTM sintetis.");
			if (form.isConnected) onContinue({ fields, building, reason, image });
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Foto tidak bisa diproses. Coba lagi.",
			);
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}

	const fields = report ?? emptyFields;
	return (
		<form className="grid gap-4" onSubmit={handleSubmit}>
			<div className="space-y-1.5">
				<Label htmlFor="violation-name">Nama mahasiswa</Label>
				<Input
					id="violation-name"
					name="name"
					defaultValue={fields.name}
					required
					maxLength={160}
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="violation-nim">NIM mahasiswa</Label>
					<Input
						id="violation-nim"
						name="nim"
						defaultValue={fields.nim}
						required
						maxLength={40}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="violation-date">Tanggal kejadian</Label>
					<Input
						id="violation-date"
						name="date"
						type="date"
						defaultValue={fields.date}
						max={localDate()}
						required
					/>
				</div>
			</div>
			{!report && admin ? (
				<div className="space-y-1.5">
					<Label htmlFor="violation-building">Gedung pencatat</Label>
					<Select
						id="violation-building"
						name="building"
						required
						defaultValue=""
					>
						<option value="" disabled>
							Pilih gedung
						</option>
						{buildings.map((building) => (
							<option key={building}>{building}</option>
						))}
					</Select>
				</div>
			) : (
				<div className="flex items-center justify-between rounded-xl border border-border bg-surface-subtle/60 px-3.5 py-2.5 text-sm">
					<span className="text-muted-foreground">Gedung pencatat</span>
					<strong className="font-semibold text-foreground">
						{report?.building ?? buildings[0]}
					</strong>
				</div>
			)}
			<div className="space-y-1.5">
				<Label htmlFor="violation-description">Keterangan pelanggaran</Label>
				<Textarea
					id="violation-description"
					name="description"
					defaultValue={fields.description}
					required
					rows={4}
					maxLength={2000}
				/>
			</div>
			<div className="min-w-0 space-y-1.5">
				<Label htmlFor="violation-ktm">
					{report ? "Ganti foto KTM (opsional)" : "Foto KTM"}
				</Label>
				<input
					id="violation-ktm"
					className={`${control} file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1 file:font-semibold file:text-foreground file:text-xs`}
					name="ktm"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					required={!report}
					aria-describedby="ktm-help"
				/>
				<p id="ktm-help" className="text-muted-foreground text-xs">
					Gunakan gambar sintetis. JPG, PNG, atau WebP, maksimal 10 MB.
				</p>
			</div>
			{report && (
				<div className="space-y-1.5">
					<Label htmlFor="violation-reason">Alasan perubahan</Label>
					<Textarea
						id="violation-reason"
						name="reason"
						required
						rows={2}
						maxLength={500}
					/>
				</div>
			)}
			{error && (
				<p
					role="alert"
					className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 font-medium text-danger text-sm"
				>
					{error}
				</p>
			)}
			<div className="pt-1">
				<Button
					type="submit"
					size="lg"
					loading={busy}
					className="min-h-11 w-full rounded-xl sm:w-auto"
				>
					{busy
						? "Memproses foto…"
						: report
							? "Simpan perubahan simulasi"
							: "Lanjut ke konfirmasi"}
				</Button>
			</div>
		</form>
	);
}
