"use client";

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
			<label className="grid gap-1.5 font-semibold text-sm">
				Nama mahasiswa
				<input
					className={control}
					name="name"
					defaultValue={fields.name}
					required
					maxLength={160}
				/>
			</label>
			<label className="grid gap-1.5 font-semibold text-sm">
				NIM mahasiswa
				<input
					className={control}
					name="nim"
					defaultValue={fields.nim}
					required
					maxLength={40}
				/>
			</label>
			<label className="grid gap-1.5 font-semibold text-sm">
				Tanggal kejadian
				<input
					className={control}
					name="date"
					type="date"
					defaultValue={fields.date}
					max={localDate()}
					required
				/>
			</label>
			{!report && admin ? (
				<label className="grid gap-1.5 font-semibold text-sm">
					Gedung pencatat
					<select className={control} name="building" required defaultValue="">
						<option value="" disabled>
							Pilih gedung
						</option>
						{buildings.map((building) => (
							<option key={building}>{building}</option>
						))}
					</select>
				</label>
			) : (
				<p className="text-sm">
					Gedung pencatat: <strong>{report?.building ?? buildings[0]}</strong>
				</p>
			)}
			<label className="grid gap-1.5 font-semibold text-sm">
				Keterangan pelanggaran
				<textarea
					className={control}
					name="description"
					defaultValue={fields.description}
					required
					rows={4}
					maxLength={2000}
				/>
			</label>
			<label className="grid min-w-0 gap-1.5 font-semibold text-sm">
				{report ? "Ganti foto KTM (opsional)" : "Foto KTM"}
				<input
					className={control}
					name="ktm"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					required={!report}
					aria-describedby="ktm-help"
				/>
			</label>
			<p id="ktm-help" className="text-muted-foreground text-sm">
				Gunakan gambar sintetis. JPG, PNG, atau WebP, maksimal 10 MB.
			</p>
			{report && (
				<label className="grid gap-1.5 font-semibold text-sm">
					Alasan perubahan
					<textarea
						className={control}
						name="reason"
						required
						rows={2}
						maxLength={500}
					/>
				</label>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<Button
				type="submit"
				size="lg"
				loading={busy}
				className="justify-self-start"
			>
				{busy
					? "Memproses foto…"
					: report
						? "Simpan perubahan simulasi"
						: "Lanjut ke konfirmasi"}
			</Button>
		</form>
	);
}
