"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

export const DORM_HALL = { centerLat: -6.9712891, centerLng: 107.628339 };

const LocationMap = dynamic(() => import("./event-location-map"), {
	ssr: false,
	loading: () => <p role="status">Memuat peta…</p>,
});

export type LocationPoint = { centerLat: number; centerLng: number };

export function EventLocationPicker({
	centerLat,
	centerLng,
	radius,
	onChange,
	disabled = false,
}: LocationPoint & {
	radius: number;
	onChange: (point: LocationPoint) => void;
	disabled?: boolean;
}) {
	const [custom, setCustom] = useState(
		centerLat !== DORM_HALL.centerLat || centerLng !== DORM_HALL.centerLng,
	);
	return (
		<div className="space-y-3">
			<fieldset className="space-y-2">
				<legend className="mb-2 font-medium text-sm">Lokasi kegiatan</legend>
				<div className="flex flex-wrap gap-3">
					{[false, true].map((value) => (
						<label
							key={String(value)}
							className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
						>
							<input
								type="radio"
								disabled={disabled}
								name="event-location"
								checked={custom === value}
								onChange={() => {
									setCustom(value);
									if (!value) onChange({ ...DORM_HALL });
								}}
							/>
							{value ? "Pilih lokasi lain di peta" : "Dorm Hall"}
						</label>
					))}
				</div>
			</fieldset>
			<p id="location-help" className="text-muted-foreground text-sm">
				{custom
					? "Klik atau ketuk peta untuk memasang pin, atau geser pin ke lokasi kegiatan. Dengan keyboard, geser peta menggunakan tombol panah lalu pilih titik tengah."
					: "Dorm Hall sudah dipilih. Gunakan lokasi lain untuk memasang pin sendiri."}
			</p>
			<details
				open={custom || undefined}
				className="rounded-xl border border-border"
			>
				<summary className="focus-ring cursor-pointer rounded-xl px-4 py-3 font-medium text-sm">
					{custom ? "Peta lokasi kegiatan" : "Lihat peta Dorm Hall"}
				</summary>
				<div className="border-border border-t p-3">
					<LocationMap
						centerLat={centerLat}
						centerLng={centerLng}
						radius={radius}
						editable={custom && !disabled}
						onChange={onChange}
					/>
				</div>
			</details>
			<p
				role="status"
				className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm"
			>
				<span className="font-medium text-foreground">
					{custom ? "Lokasi khusus" : "Dorm Hall"}
				</span>
				<span>· Radius {radius} m</span>
			</p>
			<details className="text-muted-foreground text-xs">
				<summary className="focus-ring min-h-11 w-fit cursor-pointer rounded-md py-3">
					Koordinat lokasi
				</summary>
				<p className="break-all pb-2">
					{custom ? "Titik terpilih" : "Dorm Hall"}: {centerLat.toFixed(7)},{" "}
					{centerLng.toFixed(7)}
				</p>
			</details>
		</div>
	);
}
